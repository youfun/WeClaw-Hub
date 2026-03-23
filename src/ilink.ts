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
} from "./types.ts";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "1.0.2";
const LONG_POLL_TIMEOUT_MS = 25_000; // CF Workers fetch ~30s limit
const SEND_TIMEOUT_MS = 15_000;
const CONFIG_TIMEOUT_MS = 10_000;

// QR login endpoints (always on default base URL)
const QR_CODE_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const QR_STATUS_URL = `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=`;

function buildBaseInfo(): BaseInfo {
  return { channel_version: CHANNEL_VERSION };
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
  return apiPost<SendMessageResponse>(
    creds.baseurl || DEFAULT_BASE_URL,
    "ilink/bot/sendmessage",
    msg,
    creds.bot_token,
    SEND_TIMEOUT_MS,
  );
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

export async function pollQRStatus(qrcode: string): Promise<QRStatusResponse> {
  return apiGet<QRStatusResponse>(QR_STATUS_URL + encodeURIComponent(qrcode), 40_000);
}

// ---- Helpers ----

export function newClientId(): string {
  return crypto.randomUUID();
}

/** Extract text body from a message's item_list. */
export function extractText(items: { type: number; text_item?: { text: string } }[]): string {
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text) {
      return item.text_item.text;
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
