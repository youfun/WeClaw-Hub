// BotSession Durable Object
// Each WeChat bot account gets one DO instance.
// Alarm-driven long-poll loop for iLink message reception.
//
// Ported from: ref/weclaw/ilink/monitor.go (poll loop)
//              ref/weclaw/ilink/client.go (API calls)
//              ref/knockknock/index.mjs (DO pattern)
//              ref/weixin-plugin/package/src/monitor/monitor.ts (official SDK)

import type { Env } from "./index.ts";
import type {
  Credentials,
  WeixinMessage,
  Backend,
  BridgeMessage,
  BridgeReply,
} from "./types.ts";
import { MessageType, MessageState, ItemType, TypingStatus } from "./types.ts";
import {
  getUpdates,
  sendMessage,
  getConfig,
  sendTyping,
  newClientId,
  extractText,
} from "./ilink.ts";
import type { Message, LLMConfig } from "./agent.ts";
import { callClaude, DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from "./agent.ts";
import type { CustomModel } from "./types.ts";
import { parseRoute, HELP_TEXT } from "./router.ts";

const ERR_SESSION_EXPIRED = -14;
const SESSION_PAUSE_MS = 60 * 60 * 1_000; // 1 hour pause on session expiry
// Backoff aligned with Elixir: 2s for first 3 failures, then 30s and reset
const BACKOFF_SHORT_MS = 2_000;
const BACKOFF_LONG_MS = 30_000;
const BACKOFF_THRESHOLD = 3;

const TYPING_TICKET_TTL_MS = 5 * 60 * 1_000; // cache typing ticket 5 minutes
const CHAT_HISTORY_LIMIT = 100; // 50 turns = 100 messages
const BRIDGE_PING_INTERVAL_MS = 30_000;

// Keep-alive: remind bot owner before 24h reply window expires
const KEEPALIVE_MSG = "⏰ 会话窗口即将过期，请回复任意消息保持连接";
const KEEPALIVE_MIN_MS = 23.5 * 60 * 60 * 1_000; // 23h30m
const KEEPALIVE_MAX_MS = 23 * 60 * 60 * 1_000 + 55 * 60 * 1_000; // 23h55m

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS context_tokens (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, bucket)
);
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS typing_tickets (
  user_id TEXT PRIMARY KEY,
  ticket TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

interface BridgeSession {
  ws: WebSocket;
  pending: Map<string, { userId: string; contextToken: string; text: string }>;
  lastPingAt: number;
}

export class BotSession implements DurableObject {
  state: DurableObjectState;
  env: Env;
  private initialized = false;
  private consecutiveFailures = 0;
  private bridgeSessions: BridgeSession[] = [];
  private lastBridgePing = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private ensureSchema(): void {
    if (this.initialized) return;
    this.state.storage.sql.exec(SCHEMA);
    this.initialized = true;
  }

  // ---- KV helpers ----

  private kvGet(key: string): string | null {
    const rows = this.state.storage.sql
      .exec("SELECT value FROM kv WHERE key = ?", key)
      .toArray();
    return rows.length ? (rows[0]!.value as string) : null;
  }

  private kvSet(key: string, value: string): void {
    this.state.storage.sql.exec(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      key,
      value,
    );
  }

  private getCredentials(): Credentials | null {
    const raw = this.kvGet("credentials");
    if (!raw) return null;
    return JSON.parse(raw) as Credentials;
  }

  private setCredentials(creds: Credentials): void {
    this.kvSet("credentials", JSON.stringify(creds));
  }

  private getUpdatesBuf(): string {
    return this.kvGet("get_updates_buf") ?? "";
  }

  private setUpdatesBuf(buf: string): void {
    this.kvSet("get_updates_buf", buf);
  }

  // ---- Context token cache ----

  private saveContextToken(userId: string, token: string): void {
    this.state.storage.sql.exec(
      "INSERT OR REPLACE INTO context_tokens (user_id, token, updated_at) VALUES (?, ?, ?)",
      userId,
      token,
      Date.now(),
    );
  }

  private getContextToken(userId: string): string | null {
    const rows = this.state.storage.sql
      .exec("SELECT token FROM context_tokens WHERE user_id = ?", userId)
      .toArray();
    return rows.length ? (rows[0]!.token as string) : null;
  }

  // ---- Chat history (per user) ----

  private getChatHistory(userId: string): Message[] {
    const rows = this.state.storage.sql
      .exec(
        "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at ASC, id ASC",
        userId,
      )
      .toArray();
    return rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content as string,
    }));
  }

  private addChatHistory(userId: string, role: "user" | "assistant", content: string): void {
    this.state.storage.sql.exec(
      "INSERT INTO chat_history (user_id, role, content, created_at) VALUES (?, ?, ?, ?)",
      userId,
      role,
      content,
      Date.now(),
    );
    // Trim oldest rows beyond CHAT_HISTORY_LIMIT per user
    this.state.storage.sql.exec(
      `DELETE FROM chat_history WHERE user_id = ? AND id NOT IN (
        SELECT id FROM chat_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
      )`,
      userId,
      userId,
      CHAT_HISTORY_LIMIT,
    );
  }

  private clearChatHistory(userId: string): void {
    this.state.storage.sql.exec("DELETE FROM chat_history WHERE user_id = ?", userId);
  }

  // ---- Model config ----

  private resolveApiKey(key: string): string {
    return key.replace(/\$\{(\w+)\}/g, (_, name) => (this.env as unknown as Record<string, string>)[name] ?? "");
  }

  private async loadModels(): Promise<CustomModel[]> {
    return (await this.env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
  }

  private async getActiveLLMConfig(): Promise<{ config: LLMConfig; displayName: string }> {
    const models = await this.loadModels();
    const activeName = await this.env.BACKENDS.get("llm:active");

    if (models.length) {
      const active = (activeName && models.find((m) => m.displayName === activeName)) || models[0]!;
      return {
        config: {
          apiKey: this.resolveApiKey(active.apiKey),
          baseUrl: active.baseUrl,
          model: active.model,
          maxOutputTokens: active.maxOutputTokens,
        },
        displayName: active.displayName,
      };
    }

    // Fallback to env vars
    return {
      config: {
        apiKey: this.env.LLM_API_KEY ?? this.env.ANTHROPIC_API_KEY ?? "",
        baseUrl: this.env.LLM_BASE_URL,
        model: this.env.LLM_MODEL,
      },
      displayName: this.env.LLM_BASE_URL ? (this.env.LLM_MODEL ?? DEFAULT_OPENAI_MODEL) : DEFAULT_ANTHROPIC_MODEL,
    };
  }

  // ---- Typing ticket cache ----

  private async getOrFetchTypingTicket(
    creds: Credentials,
    userId: string,
    contextToken: string,
  ): Promise<string | null> {
    const rows = this.state.storage.sql
      .exec("SELECT ticket, updated_at FROM typing_tickets WHERE user_id = ?", userId)
      .toArray();

    if (rows.length) {
      const { ticket, updated_at } = rows[0]!;
      if (Date.now() - (updated_at as number) < TYPING_TICKET_TTL_MS) {
        return ticket as string;
      }
    }

    try {
      const config = await getConfig(creds, userId, contextToken);
      if (!config.typing_ticket) return null;
      this.state.storage.sql.exec(
        "INSERT OR REPLACE INTO typing_tickets (user_id, ticket, updated_at) VALUES (?, ?, ?)",
        userId,
        config.typing_ticket,
        Date.now(),
      );
      return config.typing_ticket;
    } catch (err) {
      console.error("[typing] getConfig failed:", err);
      return null;
    }
  }

  private async sendTypingTo(
    creds: Credentials,
    userId: string,
    contextToken: string,
  ): Promise<void> {
    try {
      const ticket = await this.getOrFetchTypingTicket(creds, userId, contextToken);
      if (!ticket) return;
      await sendTyping(creds, userId, ticket, TypingStatus.Typing);
    } catch (err) {
      console.error("[typing] sendTyping failed:", err);
    }
  }

  // ---- HTTP handler ----

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/login":
        return this.handleLogin(request);
      case "/rate-limit":
        return this.handleRateLimit(request);
      case "/send":
        return this.handleSend(request);
      case "/status":
        return this.handleStatus();
      case "/start":
        return this.handleStart();
      case "/stop":
        return this.handleStop();
      case "/bridge":
        return this.handleBridgeUpgrade(request);
      case "/settings":
        return this.handleSettings(request);
      default:
        return json({ error: "not found" }, 404);
    }
  }

  // POST /login — save credentials and start polling
  private async handleLogin(request: Request): Promise<Response> {
    const creds = (await request.json()) as Credentials;
    if (!creds.bot_token || !creds.ilink_bot_id) {
      return json({ error: "missing bot_token or ilink_bot_id" }, 400);
    }
    this.setCredentials(creds);
    this.setUpdatesBuf("");
    this.consecutiveFailures = 0;
    await this.state.storage.setAlarm(Date.now() + 100);
    await this.updateBotsIndex(creds.ilink_bot_id);
    return json({ ok: true, message: "credentials saved, polling started" });
  }

  private async updateBotsIndex(botId: string): Promise<void> {
    try {
      const raw = await this.env.BACKENDS.get("bots");
      const bots: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (!bots.includes(botId)) {
        bots.push(botId);
        await this.env.BACKENDS.put("bots", JSON.stringify(bots));
      }
    } catch (err) {
      console.error("[login] updateBotsIndex failed:", err);
    }
  }

  // POST /send — send a text message to a user
  private async handleSend(request: Request): Promise<Response> {
    const creds = this.getCredentials();
    if (!creds) return json({ error: "not logged in" }, 401);

    const body = (await request.json()) as {
      text: string;
      context_token?: string;
    };

    if (!body.text) {
      return json({ error: "missing text" }, 400);
    }

    // Each bot has exactly one recipient: its owner (ilink_user_id from login credentials).
    const toUserId = creds.ilink_user_id;
    if (!toUserId) {
      return json({ error: "bot has no ilink_user_id (not logged in?)" }, 400);
    }

    const contextToken =
      body.context_token || this.getContextToken(toUserId) || "";

    const resp = await sendMessage(creds, {
      msg: {
        from_user_id: creds.ilink_bot_id,
        to_user_id: toUserId,
        client_id: newClientId(),
        message_type: MessageType.Bot,
        message_state: MessageState.Finish,
        item_list: [
          { type: ItemType.Text, text_item: { text: body.text } },
        ],
        context_token: contextToken,
      },
      base_info: { channel_version: "1.0.2" },
    });

    return json(resp);
  }

  // POST /rate-limit — internal login rate-limit counter
  private async handleRateLimit(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      key?: string;
      limit?: number;
      window_ms?: number;
    };

    if (!body.key || !body.limit || !body.window_ms) {
      return json({ error: "missing rate-limit fields" }, 400);
    }

    const bucket = Math.floor(Date.now() / body.window_ms) * body.window_ms;
    this.state.storage.sql.exec(
      "DELETE FROM rate_limits WHERE key = ? AND bucket < ?",
      body.key,
      bucket - body.window_ms,
    );
    this.state.storage.sql.exec(
      `INSERT INTO rate_limits (key, bucket, count) VALUES (?, ?, 1)
       ON CONFLICT(key, bucket) DO UPDATE SET count = count + 1`,
      body.key,
      bucket,
    );

    const rows = this.state.storage.sql
      .exec(
        "SELECT count FROM rate_limits WHERE key = ? AND bucket = ?",
        body.key,
        bucket,
      )
      .toArray();
    const count = Number(rows[0]?.count ?? 0);

    return json({
      ok: true,
      allowed: count <= body.limit,
      count,
      remaining: Math.max(body.limit - count, 0),
      retry_after_ms: bucket + body.window_ms - Date.now(),
    });
  }

  // GET /status
  private async handleStatus(): Promise<Response> {
    const creds = this.getCredentials();
    const alarm = await this.state.storage.getAlarm();
    const pausedUntil = this.kvGet("paused_until");
    const isPaused = pausedUntil ? Date.now() < Number(pausedUntil) : false;

    return json({
      logged_in: !!creds,
      bot_id: creds?.ilink_bot_id ?? null,
      ilink_user_id: creds?.ilink_user_id ?? null,
      remark: this.kvGet("remark") ?? "",
      polling: alarm !== null,
      paused: isPaused,
      consecutive_failures: this.consecutiveFailures,
      bridge_sessions: this.bridgeSessions.length,
      keepalive: this.kvGet("keepalive") === "1",
    });
  }

  // GET/PATCH /settings — per-bot settings
  private async handleSettings(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return json({ keepalive: this.kvGet("keepalive") === "1", remark: this.kvGet("remark") ?? "" });
    }
    if (request.method === "PATCH") {
      const body = (await request.json()) as { keepalive?: boolean; remark?: string };
      if (body.keepalive !== undefined) {
        this.kvSet("keepalive", body.keepalive ? "1" : "0");
        if (!body.keepalive) {
          // Clear pending reminder when disabled
          this.kvSet("keepalive_remind_at", "");
          this.kvSet("keepalive_reminded", "");
        }
      }
      if (body.remark !== undefined) {
        this.kvSet("remark", body.remark.trim());
      }
      return json({ ok: true, keepalive: this.kvGet("keepalive") === "1", remark: this.kvGet("remark") ?? "" });
    }
    return json({ error: "method not allowed" }, 405);
  }

  // POST /start — manually start polling
  private async handleStart(): Promise<Response> {
    const creds = this.getCredentials();
    if (!creds) return json({ error: "not logged in" }, 401);
    this.consecutiveFailures = 0;
    await this.state.storage.setAlarm(Date.now() + 100);
    return json({ ok: true, message: "polling started" });
  }

  // POST /stop
  private async handleStop(): Promise<Response> {
    await this.state.storage.deleteAlarm();
    return json({ ok: true, message: "polling stopped" });
  }

  // ---- Bridge WebSocket ----
  // Reference: ref/knockknock/index.mjs (WebSocket DO pattern)

  private handleBridgeUpgrade(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "websocket upgrade required" }, 426);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const session: BridgeSession = {
      ws: server,
      pending: new Map(),
      lastPingAt: Date.now(),
    };

    server.accept();
    this.bridgeSessions.push(session);

    server.addEventListener("message", (event) => {
      this.handleBridgeMessage(session, event.data as string).catch((err) => {
        console.error("[bridge] message handler error:", err);
      });
    });

    server.addEventListener("close", () => {
      this.bridgeSessions = this.bridgeSessions.filter((s) => s !== session);
      session.pending.clear();
      console.log(`[bridge] session closed, ${this.bridgeSessions.length} remaining`);
    });

    server.addEventListener("error", () => {
      this.bridgeSessions = this.bridgeSessions.filter((s) => s !== session);
      session.pending.clear();
    });

    console.log(`[bridge] new session, total: ${this.bridgeSessions.length}`);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBridgeMessage(session: BridgeSession, data: string): Promise<void> {
    let msg: { type: string; msg_id?: string; text?: string };
    try {
      msg = JSON.parse(data) as { type: string; msg_id?: string; text?: string };
    } catch {
      console.error("[bridge] invalid JSON:", data.slice(0, 100));
      return;
    }

    if (msg.type === "pong") {
      session.lastPingAt = Date.now();
      return;
    }

    if (!msg.msg_id) return;

    if (msg.type === "typing") {
      const pending = session.pending.get(msg.msg_id);
      if (!pending) return;
      const creds = this.getCredentials();
      if (creds) await this.sendTypingTo(creds, pending.userId, pending.contextToken);
      return;
    }

    if (msg.type === "reply" && msg.text) {
      const pending = session.pending.get(msg.msg_id);
      if (!pending) return;
      session.pending.delete(msg.msg_id);
      const creds = this.getCredentials();
      if (!creds) return;
      await sendMessage(creds, {
        msg: {
          from_user_id: creds.ilink_bot_id,
          to_user_id: pending.userId,
          client_id: newClientId(),
          message_type: MessageType.Bot,
          message_state: MessageState.Finish,
          item_list: [{ type: ItemType.Text, text_item: { text: msg.text } }],
          context_token: pending.contextToken,
        },
        base_info: { channel_version: "1.0.2" },
      });
      console.log(`[bridge] replied to ${pending.userId}: ${msg.text.slice(0, 50)}`);
    }
  }

  private pingBridgeSessions(): void {
    const now = Date.now();
    this.bridgeSessions = this.bridgeSessions.filter((session) => {
      // Drop sessions that haven't responded to ping in 2 intervals
      if (now - session.lastPingAt > BRIDGE_PING_INTERVAL_MS * 2) {
        try { session.ws.close(1001, "ping timeout"); } catch { /* ignore */ }
        session.pending.clear();
        return false;
      }
      try {
        session.ws.send(JSON.stringify({ type: "ping" }));
      } catch {
        session.pending.clear();
        return false;
      }
      return true;
    });
  }

  // ---- Alarm: iLink long-poll cycle ----
  // Aligned with Elixir UpdatePoller: immediate re-poll on success,
  // backoff 2s (< 3 failures) / 30s (>= 3 failures) on error,
  // 1h pause on session expired (ret or errcode == -14).

  async alarm(): Promise<void> {
    this.ensureSchema();

    // Heartbeat bridge sessions every BRIDGE_PING_INTERVAL_MS
    const now = Date.now();
    if (now - this.lastBridgePing >= BRIDGE_PING_INTERVAL_MS) {
      this.pingBridgeSessions();
      this.lastBridgePing = now;
    }

    // Check session pause (after errcode -14)
    const pausedUntil = this.kvGet("paused_until");
    if (pausedUntil && Date.now() < Number(pausedUntil)) {
      await this.state.storage.setAlarm(Date.now() + 60_000);
      return;
    }

    const creds = this.getCredentials();
    if (!creds) return;

    try {
      const buf = this.getUpdatesBuf();
      console.log(`[poll] getupdates buf=${buf ? buf.slice(0, 32) + "..." : "(empty)"}`);
      const resp = await getUpdates(creds, buf);

      const ret = resp.ret ?? 0;
      const errcode = resp.errcode ?? 0;
      console.log(`[poll] ret=${ret} errcode=${errcode} msgs=${resp.msgs?.length ?? 0}`);

      // Session expired — Elixir checks both ret and errcode
      if (ret === ERR_SESSION_EXPIRED || errcode === ERR_SESSION_EXPIRED) {
        console.log("[poll] session expired (-14), pausing 1h");
        this.setUpdatesBuf("");
        this.kvSet("paused_until", String(Date.now() + SESSION_PAUSE_MS));
        await this.state.storage.setAlarm(Date.now() + SESSION_PAUSE_MS);
        return;
      }

      // Other server errors — backoff
      if (ret !== 0 || errcode !== 0) {
        console.log(`[poll] server error: ret=${ret} errcode=${errcode} errmsg=${resp.errmsg}`);
        this.consecutiveFailures++;
        await this.scheduleBackoff();
        return;
      }

      // Success — reset failures
      this.consecutiveFailures = 0;

      // Update sync buffer
      if (resp.get_updates_buf && resp.get_updates_buf !== buf) {
        this.setUpdatesBuf(resp.get_updates_buf);
      }

      // Process messages
      if (resp.msgs?.length) {
        console.log(`[poll] processing ${resp.msgs.length} message(s)`);
        for (const msg of resp.msgs) {
          await this.handleMessage(creds, msg);
        }
      }

      // Keep-alive check: remind bot owner before 24h window expires
      await this.checkKeepalive(creds);

      // Immediate re-poll (like Elixir: send(self(), :poll))
      await this.state.storage.setAlarm(Date.now() + 100);
    } catch (err) {
      this.consecutiveFailures++;
      console.error(`[poll] error (failures=${this.consecutiveFailures}):`, err);
      await this.scheduleBackoff();
    }
  }

  private async checkKeepalive(creds: Credentials): Promise<void> {
    if (this.kvGet("keepalive") !== "1") return;
    if (this.kvGet("keepalive_reminded") === "1") return;

    const remindAtStr = this.kvGet("keepalive_remind_at");
    if (!remindAtStr) return;

    const remindAt = Number(remindAtStr);
    if (Date.now() < remindAt) return;

    const toUserId = creds.ilink_user_id;
    if (!toUserId) return;

    const contextToken = this.getContextToken(toUserId) || "";
    try {
      await sendMessage(creds, {
        msg: {
          from_user_id: creds.ilink_bot_id,
          to_user_id: toUserId,
          client_id: newClientId(),
          message_type: MessageType.Bot,
          message_state: MessageState.Finish,
          item_list: [{ type: ItemType.Text, text_item: { text: KEEPALIVE_MSG } }],
          context_token: contextToken,
        },
        base_info: { channel_version: "1.0.2" },
      });
      this.kvSet("keepalive_reminded", "1");
      console.log(`[keepalive] reminder sent to owner ${toUserId}`);
    } catch (err) {
      console.error("[keepalive] send failed:", err);
    }
  }

  // Elixir backoff: 2s for first 3, then 30s and reset counter
  private async scheduleBackoff(): Promise<void> {
    if (this.consecutiveFailures >= BACKOFF_THRESHOLD) {
      this.consecutiveFailures = 0;
      await this.state.storage.setAlarm(Date.now() + BACKOFF_LONG_MS);
    } else {
      await this.state.storage.setAlarm(Date.now() + BACKOFF_SHORT_MS);
    }
  }

  // ---- Message handling ----

  private async handleMessage(creds: Credentials, msg: WeixinMessage): Promise<void> {
    // Only process finished user messages
    if (msg.message_type !== MessageType.User) return;
    if (msg.message_state !== MessageState.Finish) return;

    // Cache context token (like Elixir: merge_context_tokens)
    if (msg.context_token && msg.from_user_id) {
      this.saveContextToken(msg.from_user_id, msg.context_token);
    }

    const text = extractText(msg.item_list);
    if (!text) return;

    const userId = msg.from_user_id;
    const contextToken = msg.context_token;

    console.log(`[msg] from=${userId} text="${text.slice(0, 80)}"`);

    // Schedule keepalive reminder when bot owner sends a message
    if (userId === creds.ilink_user_id && this.kvGet("keepalive") === "1") {
      const jitter = KEEPALIVE_MIN_MS + Math.random() * (KEEPALIVE_MAX_MS - KEEPALIVE_MIN_MS);
      this.kvSet("keepalive_remind_at", String(Date.now() + jitter));
      this.kvSet("keepalive_reminded", "");
    }

    // Priority 1: Bridge (forward to connected bridge client)
    if (this.bridgeSessions.length > 0) {
      const session = this.bridgeSessions[0]!;
      const msgId = newClientId();
      const bridgeMsg: BridgeMessage = {
        type: "message",
        msg_id: msgId,
        from: userId,
        text,
        context_token: contextToken,
      };
      session.pending.set(msgId, { userId, contextToken, text });
      try {
        session.ws.send(JSON.stringify(bridgeMsg));
        console.log(`[bridge] forwarded msg_id=${msgId}`);
        return;
      } catch (err) {
        // Bridge send failed — remove and fall through to next priority
        console.error("[bridge] send failed, removing session:", err);
        session.pending.clear();
        this.bridgeSessions = this.bridgeSessions.filter((s) => s !== session);
      }
    }

    // Priority 2: Backend webhook routing
    const backendHandled = await this.routeToBackends(creds, userId, text, contextToken);
    if (backendHandled) return;

    // Priority 3: Internal agent (Claude + commands)
    await this.handleWithAgent(creds, userId, text, contextToken);
  }

  // ---- Backend routing ----

  private async routeToBackends(
    creds: Credentials,
    userId: string,
    text: string,
    contextToken: string,
  ): Promise<boolean> {
    let listResult: KVNamespaceListResult<unknown, string>;
    try {
      listResult = await this.env.BACKENDS.list({ prefix: "backend:" });
    } catch (err) {
      console.error("[backends] KV list failed:", err);
      return false;
    }
    if (!listResult.keys.length) return false;

    const matching: Backend[] = [];
    for (const key of listResult.keys) {
      const backend = (await this.env.BACKENDS.get(key.name, "json")) as Backend | null;
      if (backend && this.matchesBackend(backend, userId)) {
        matching.push(backend);
      }
    }
    if (!matching.length) return false;

    // Sort by priority descending
    matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // fan_out of first (highest priority) backend determines delivery mode
    const fanOut = matching[0]!.fan_out;
    const toDeliver = fanOut ? matching : [matching[0]!];

    const payload = {
      from_user_id: userId,
      bot_id: creds.ilink_bot_id,
      text,
      context_token: contextToken,
      timestamp: Date.now(),
    };

    let anyDelivered = false;
    for (const backend of toDeliver) {
      try {
        const res = await fetch(backend.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(backend.auth_token ? { Authorization: `Bearer ${backend.auth_token}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          console.error(`[backend:${backend.id}] delivery failed: ${res.status}`);
        } else {
          anyDelivered = true;
        }
      } catch (err) {
        console.error(`[backend:${backend.id}] delivery error:`, err);
      }
    }

    return anyDelivered;
  }

  private matchesBackend(backend: Backend, userId: string): boolean {
    if (!backend.routing_rules?.length) return false;
    for (const rule of backend.routing_rules) {
      if (rule.type === "all") return true;
      if (rule.type === "user_id" && rule.values?.includes(userId)) return true;
    }
    return false;
  }

  // ---- Internal agent (Claude + commands) ----

  private async handleWithAgent(
    creds: Credentials,
    userId: string,
    text: string,
    contextToken: string,
  ): Promise<void> {
    const action = parseRoute(text);
    let replyText: string;

    switch (action.type) {
      case "help":
        replyText = HELP_TEXT;
        break;

      case "status":
        replyText = await this.buildStatusText();
        break;

      case "clear":
        this.clearChatHistory(userId);
        replyText = "對話歷史已清空";
        break;

      case "model": {
        const models = await this.loadModels();
        const activeName = await this.env.BACKENDS.get("llm:active");
        const activeModel = (activeName && models.find((m) => m.displayName === activeName)) || models[0] || null;

        if (!action.args) {
          // Show current model
          if (!activeModel) {
            replyText = "未配置模型，请在管理页面添加。";
          } else {
            replyText = `当前模型：${activeModel.displayName}`;
          }
          break;
        }

        if (action.args === "list") {
          if (!models.length) {
            replyText = "未配置任何模型。";
          } else {
            const lines = models.map((m, i) =>
              `${i + 1}. ${m.displayName}${m.displayName === activeModel?.displayName ? " ← 当前" : ""}`
            );
            replyText = lines.join("\n");
          }
          break;
        }

        // Switch by number or name
        const num = parseInt(action.args, 10);
        const target = !isNaN(num) && num >= 1 && num <= models.length
          ? models[num - 1]!
          : models.find((m) => m.displayName === action.args);

        if (!target) {
          replyText = `未找到模型「${action.args}」。发送 /model list 查看可用模型。`;
        } else {
          await this.env.BACKENDS.put("llm:active", target.displayName);
          replyText = `已切换到 ${target.displayName}`;
        }
        break;
      }

      case "agent": {
        if (!action.message) {
          replyText = "请输入消息";
          break;
        }
        // Send typing indicator before calling LLM
        await this.sendTypingTo(creds, userId, contextToken);
        this.addChatHistory(userId, "user", action.message);
        const history = this.getChatHistory(userId);
        const { config: llmConfig, displayName } = await this.getActiveLLMConfig();
        const systemPrompt = this.env.SYSTEM_PROMPT ?? "你是一个有用的AI助手。";
        const raw = await callClaude(history, systemPrompt, llmConfig);
        this.addChatHistory(userId, "assistant", raw);
        replyText = `[${displayName}]\n${raw}`;
        break;
      }

      default:
        replyText = "未知命令";
    }

    await sendMessage(creds, {
      msg: {
        from_user_id: creds.ilink_bot_id,
        to_user_id: userId,
        client_id: newClientId(),
        message_type: MessageType.Bot,
        message_state: MessageState.Finish,
        item_list: [{ type: ItemType.Text, text_item: { text: replyText } }],
        context_token: contextToken,
      },
      base_info: { channel_version: "1.0.2" },
    });
  }

  private async buildStatusText(): Promise<string> {
    const creds = this.getCredentials();
    const bridgeCount = this.bridgeSessions.length;
    const { displayName } = await this.getActiveLLMConfig();
    return [
      `Bot: ${creds?.ilink_bot_id ?? "未登录"}`,
      `AI: ${displayName}`,
      `Bridge: ${bridgeCount > 0 ? `${bridgeCount} 个连接` : "无"}`,
    ].join("\n");
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
