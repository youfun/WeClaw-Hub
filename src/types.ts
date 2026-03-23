// Shared type definitions
// Reference: ref/weclaw/ilink/types.go
// Reference: ref/weixin-plugin/package/src/api/types.ts

// ---- iLink protocol types ----

export const MessageType = {
  None: 0,
  User: 1,
  Bot: 2,
} as const;

export const MessageState = {
  New: 0,
  Generating: 1,
  Finish: 2,
} as const;

export const ItemType = {
  None: 0,
  Text: 1,
  Image: 2,
  Voice: 3,
  File: 4,
  Video: 5,
} as const;

export interface BaseInfo {
  channel_version?: string;
}

export interface TextItem {
  text: string;
}

export interface ImageItem {
  url?: string;
}

export interface MessageItem {
  type: number;
  text_item?: TextItem;
  image_item?: ImageItem;
}

export interface WeixinMessage {
  from_user_id: string;
  to_user_id: string;
  message_type: number;
  message_state: number;
  item_list: MessageItem[];
  context_token: string;
}

export interface GetUpdatesRequest {
  get_updates_buf: string;
  base_info: BaseInfo;
}

export interface GetUpdatesResponse {
  ret: number;
  errcode?: number;
  errmsg?: string;
  msgs: WeixinMessage[];
  get_updates_buf: string;
  longpolling_timeout_ms?: number;
}

export interface SendMsg {
  from_user_id: string;
  to_user_id: string;
  client_id: string;
  message_type: number;
  message_state: number;
  item_list: MessageItem[];
  context_token: string;
}

export interface SendMessageRequest {
  msg: SendMsg;
  base_info: BaseInfo;
}

export interface SendMessageResponse {
  ret: number;
  errmsg?: string;
}

// ---- LLM model config (stored in KV as llm:models array) ----

export interface CustomModel {
  model: string;          // model ID sent to API
  displayName: string;    // unique name — used in UI, reply label, and /model command
  baseUrl?: string;       // OpenAI-compat URL; omit = Anthropic native
  apiKey: string;         // supports ${ENV_VAR} interpolation
  provider: "anthropic" | "openai-compat";
  maxOutputTokens?: number;
}

// ---- Typing / Config types ----

export const TypingStatus = {
  Typing: 1,
  Cancel: 2,
} as const;

export interface GetConfigRequest {
  ilink_user_id: string;
  context_token?: string;
  base_info: BaseInfo;
}

export interface GetConfigResponse {
  ret: number;
  errmsg?: string;
  typing_ticket?: string;
}

export interface SendTypingRequest {
  ilink_user_id: string;
  typing_ticket: string;
  status: number;
  base_info: BaseInfo;
}

export interface SendTypingResponse {
  ret: number;
  errmsg?: string;
}

// ---- QR Login types ----

export interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export interface QRStatusResponse {
  status: string; // "wait" | "scaned" | "confirmed" | "expired"
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

export interface Credentials {
  bot_token: string;
  ilink_bot_id: string;
  baseurl: string;
  ilink_user_id: string;
}

export type WebhookVerifyMode = "hmac-sha256" | "bearer" | "none";

export interface WebhookConfig {
  /** URL segment — random string like "gh_a1b2c3d4" */
  path: string;
  /** Human-readable label shown in the management UI */
  name: string;
  /** Parser to use: "github" | "generic" | custom */
  source: string;
  secret: string;
  verify: WebhookVerifyMode;
  /**
   * Bot IDs to fan-out to. Supports multiple bots so one webhook can notify
   * several WeChat accounts simultaneously.
   *
   * Each bot has exactly one recipient — its owner's ilink_user_id, which is
   * stored in the bot's credentials at login time (1 bot : 1 to_user_id).
   * There is no per-webhook to_user_id field; delivery always goes to the
   * bot owner.
   */
  bot_ids: string[];
  header_field?: string;
  enabled: boolean;
}

// ---- Gateway types ----

export interface Backend {
  id: string;
  name: string;
  webhook_url: string;
  auth_token: string;
  routing_rules: RoutingRule[];
  priority: number;
  fan_out: boolean;
}

export interface RoutingRule {
  type: "all" | "user_id" | "source_type";
  values?: string[];
}

// ---- Bridge protocol types ----

export interface BridgeMessage {
  type: "message";
  msg_id: string;
  from: string;
  text: string;
  context_token: string;
}

export interface BridgeReply {
  type: "reply" | "typing";
  msg_id: string;
  text?: string;
}
