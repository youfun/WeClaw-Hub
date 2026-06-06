// iLink API Client for Cloudflare Workers
// Ported from: ref/weclaw/ilink/client.go + ref/weixin-plugin/package/src/api/api.ts

import type {
  BaseInfo,
  Credentials,
  GetUpdatesResponse,
  SendMessageRequest,
  SendMessageResponse,
  GetConfigResponse,
  SendTypingResponse,
  QRCodeResponse,
  QRStatusResponse,
  GetUploadUrlRequest,
  GetUploadUrlResponse,
} from "./types.ts";
import { UploadMediaType } from "./types.ts";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CHANNEL_VERSION = "2.4.2";
const BOT_AGENT = "WeClaw-Hub";
const LONG_POLL_TIMEOUT_MS = 25_000; // CF Workers fetch ~30s limit
const SEND_TIMEOUT_MS = 15_000;
const CONFIG_TIMEOUT_MS = 10_000;

// iLink-App-ClientVersion: uint32 encoded as major<<16 | minor<<8 | patch
// 2.4.2 => (2<<16)|(4<<8)|2 = 132098
const ILINK_APP_CLIENT_VERSION = "132098";
const ILINK_APP_ID = "bot";

// QR login endpoints (always on default base URL)
const QR_CODE_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const QR_STATUS_BASE_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=`;

function buildBaseInfo(): BaseInfo {
  return { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT };
}

function buildGetHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION,
  };
}

/** X-WECHAT-UIN: random uint32 → decimal string → base64 */
function randomWechatUin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return btoa(String(buf[0]!));
}

function buildHeaders(botToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION,
  };
  if (botToken) {
    headers["Authorization"] = `Bearer ${botToken}`;
  }
  return headers;
}

/** POST JSON to iLink endpoint with timeout via AbortSignal.timeout(). */
async function apiPost<T>(
  baseUrl: string,
  endpoint: string,
  body: unknown,
  botToken?: string,
  timeoutMs = SEND_TIMEOUT_MS,
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint}`;
  const jsonBody = JSON.stringify(body);

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(botToken),
    body: jsonBody,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iLink ${endpoint} HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

/** GET JSON from iLink endpoint. */
async function apiGet<T>(url: string, timeoutMs = CONFIG_TIMEOUT_MS): Promise<T> {
  const res = await fetch(url, {
    headers: buildGetHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iLink GET HTTP ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

// ---- Authenticated API methods (require credentials) ----

export async function getUpdates(
  creds: Credentials,
  getUpdatesBuf: string,
): Promise<GetUpdatesResponse> {
  try {
    const raw = await apiPost<GetUpdatesResponse>(
      creds.baseurl || DEFAULT_BASE_URL,
      "ilink/bot/getupdates",
      { get_updates_buf: getUpdatesBuf, base_info: buildBaseInfo() },
      creds.bot_token,
      LONG_POLL_TIMEOUT_MS,
    );
    // Normalize: server may omit ret/msgs/errcode
    return {
      ret: raw.ret ?? 0,
      errcode: raw.errcode ?? 0,
      errmsg: raw.errmsg,
      msgs: raw.msgs ?? [],
      get_updates_buf: raw.get_updates_buf ?? getUpdatesBuf,
      longpolling_timeout_ms: raw.longpolling_timeout_ms,
    };
  } catch (err) {
    // Long-poll timeout is normal — return empty response so caller retries
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return { ret: 0, errcode: 0, msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw err;
  }
}

export async function sendMessage(
  creds: Credentials,
  msg: SendMessageRequest,
): Promise<SendMessageResponse> {
  const payload: SendMessageRequest = {
    ...msg,
    msg: {
      ...msg.msg,
      // iLink 2.4.x expects bot-origin messages to use an empty from_user_id.
      from_user_id: msg.msg.message_type === 2 ? "" : msg.msg.from_user_id,
    },
  };
  const resp = await apiPost<SendMessageResponse>(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/sendmessage",
    payload,
    creds.bot_token,
    SEND_TIMEOUT_MS,
  );
  if ((resp.ret ?? 0) !== 0) {
    throw new Error(`sendmessage failed: ret=${resp.ret} errmsg=${resp.errmsg ?? ""}`);
  }
  return resp;
}

export async function notifyStart(creds: Credentials): Promise<void> {
  await apiPost(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/msg/notifystart",
    { base_info: buildBaseInfo() },
    creds.bot_token,
    CONFIG_TIMEOUT_MS,
  );
}

export async function notifyStop(creds: Credentials): Promise<void> {
  await apiPost(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/msg/notifystop",
    { base_info: buildBaseInfo() },
    creds.bot_token,
    CONFIG_TIMEOUT_MS,
  );
}

// ---- CDN Upload ----

const CDN_UPLOAD_TIMEOUT_MS = 30_000;

export async function getUploadUrl(
  creds: Credentials,
  params: GetUploadUrlRequest,
): Promise<GetUploadUrlResponse> {
  return apiPost<GetUploadUrlResponse>(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/getuploadurl",
    {
      filekey: params.filekey,
      media_type: params.media_type,
      to_user_id: params.to_user_id,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      thumb_rawsize: params.thumb_rawsize,
      thumb_rawfilemd5: params.thumb_rawfilemd5,
      thumb_filesize: params.thumb_filesize,
      no_need_thumb: params.no_need_thumb,
      aeskey: params.aeskey,
      base_info: buildBaseInfo(),
    },
    creds.bot_token,
    CDN_UPLOAD_TIMEOUT_MS,
  );
}

/**
 * Upload AES-128-ECB encrypted buffer to Weixin CDN.
 * Returns the download encrypt_query_param from the CDN response header.
 */
export async function uploadToCDN(
  ciphertext: Uint8Array,
  uploadFullUrl: string,
): Promise<{ downloadParam: string }> {
  const url = uploadFullUrl.trim();
  if (!url) throw new Error("CDN upload URL is empty");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: ciphertext,
    signal: AbortSignal.timeout(CDN_UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errHeader = res.headers.get("x-error-message");
    const errText = await res.text().catch(() => "");
    console.error(`[cdn] upload failed HTTP ${res.status} x-error=${errHeader} body=${errText.slice(0, 200)}`);
    throw new Error(`CDN upload failed HTTP ${res.status}: ${errHeader || errText}`);
  }

  const downloadParam = res.headers.get("x-encrypted-param");
  if (!downloadParam) {
    throw new Error("CDN upload response missing x-encrypted-param header");
  }

  return { downloadParam };
}

/**
 * Send a media message (image/video/file) with optional text caption.
 * Sends text caption first (if any), then the media item as separate messages.
 */
export async function sendMediaMessage(
  creds: Credentials,
  params: {
    to_user_id: string;
    context_token: string;
    text?: string;
    mediaItem: { type: number; image_item?: Record<string, unknown>; video_item?: Record<string, unknown>; file_item?: Record<string, unknown> };
  },
): Promise<void> {
  const { to_user_id, context_token, text, mediaItem } = params;

  const items: Array<{ type: number; [key: string]: unknown }> = [];
  if (text) {
    items.push({ type: 1, text_item: { text } });
  }
  items.push(mediaItem);

  for (const item of items) {
    await sendMessage(creds, {
      msg: {
        from_user_id: creds.ilink_bot_id,
        to_user_id,
        client_id: newClientId(),
        message_type: 2, // Bot
        message_state: 2, // Finish
        item_list: [item as import("./types.ts").MessageItem],
        context_token: context_token,
      },
      base_info: buildBaseInfo(),
    });
  }
}

export async function getConfig(
  creds: Credentials,
  ilinkUserId: string,
  contextToken?: string,
): Promise<GetConfigResponse> {
  return apiPost<GetConfigResponse>(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/getconfig",
    {
      ilink_user_id: ilinkUserId,
      context_token: contextToken ?? "",
      base_info: buildBaseInfo(),
    },
    creds.bot_token,
    CONFIG_TIMEOUT_MS,
  );
}

export async function sendTyping(
  creds: Credentials,
  ilinkUserId: string,
  typingTicket: string,
  status: number,
): Promise<SendTypingResponse> {
  return apiPost<SendTypingResponse>(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/sendtyping",
    {
      ilink_user_id: ilinkUserId,
      typing_ticket: typingTicket,
      status,
      base_info: buildBaseInfo(),
    },
    creds.bot_token,
    CONFIG_TIMEOUT_MS,
  );
}

// ---- QR Login (no auth needed) ----

export async function fetchQRCode(): Promise<QRCodeResponse> {
  return apiGet<QRCodeResponse>(QR_CODE_URL, 15_000);
}

export async function pollQRStatus(qrcode: string, redirectHost?: string): Promise<QRStatusResponse> {
  const baseUrl = redirectHost ? `https://${redirectHost}/ilink/bot/get_qrcode_status?qrcode=` : QR_STATUS_BASE_URL;
  return apiGet<QRStatusResponse>(baseUrl + encodeURIComponent(qrcode), 40_000);
}

/** Quick poll with short timeout for invite pages — avoids blocking. */
export async function quickPollQRStatus(qrcode: string, redirectHost?: string): Promise<QRStatusResponse> {
  const baseUrl = redirectHost ? `https://${redirectHost}/ilink/bot/get_qrcode_status?qrcode=` : QR_STATUS_BASE_URL;
  return apiGet<QRStatusResponse>(baseUrl + encodeURIComponent(qrcode), 5_000);
}

// ---- Helpers ----

export function newClientId(): string {
  return crypto.randomUUID();
}

/** Extract text body from a message's item_list.
 * Handles text (type=1) and voice (type=3) — voice messages include a
 * server-side ASR transcript in voice_item.text; no external API needed. */
export function extractText(items: { type: number; text_item?: { text: string }; voice_item?: { text?: string } }[]): string {
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text) {
      return item.text_item.text;
    }
    if (item.type === 3 && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}

/** Format a short summary for logging. */
export function formatMessageSummary(msg: {
  from_user_id: string;
  message_type: number;
  message_state: number;
  item_list: { type: number; text_item?: { text: string } }[];
}): string {
  let text = extractText(msg.item_list);
  if (text.length > 50) text = text.slice(0, 50) + "...";
  return `from=${msg.from_user_id} type=${msg.message_type} state=${msg.message_state} text="${text}"`;
}
