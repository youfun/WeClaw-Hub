/**
 * Invite logic — KV-based invite CRUD, validation, and public page rendering.
 * Phase 1: 分享邀请绑定 + 定期失效 + 邀请记录
 *
 * KV layout:
 *   invite:<code>       → InviteData JSON
 *   invite_usage:<code> → { records: UsageRecord[] } JSON
 */

import type { Env } from "./env.ts";
import { fetchQRCode, quickPollQRStatus } from "./ilink.ts";
import type { QRStatusResponse } from "./types.ts";
import { renderQrSvg } from "./qr.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface InviteData {
  code: string;
  creator_hash: string;
  remark: string;
  max_scans: number;
  ttl_hours: number;
  expires_at: number;
  created_at: number;
  disabled: boolean;
}

export interface UsageRecord {
  used_at: number;
  bound_bot_id: string;
  ilink_user_id: string;
  ip: string;
  success: boolean;
}

export interface InviteCreateParams {
  max_scans?: number;
  ttl_hours?: number;
  remark?: string;
}

export interface InviteListEntry {
  code: string;
  remark: string;
  max_scans: number;
  scan_count: number;
  ttl_hours: number;
  expires_at: number;
  created_at: number;
  disabled: boolean;
}

export interface InviteDetail {
  code: string;
  remark: string;
  max_scans: number;
  scan_count: number;
  ttl_hours: number;
  expires_at: number;
  created_at: number;
  disabled: boolean;
  scan_records: UsageRecord[];
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateCreateParams(params: InviteCreateParams): string | null {
  if (params.max_scans !== undefined) {
    if (!Number.isInteger(params.max_scans) || params.max_scans <= 0) {
      return "max_scans must be a positive integer";
    }
  }
  if (params.ttl_hours !== undefined) {
    if (!Number.isInteger(params.ttl_hours) || params.ttl_hours <= 0) {
      return "ttl_hours must be a positive integer";
    }
  }
  return null;
}

// ── KV Operations ──────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function hashToken(token: string): string {
  // Simple hash for creator identification — not a secure hash, just a fingerprint
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const chr = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export async function createInvite(
  env: Env,
  params: InviteCreateParams,
  creatorToken: string,
): Promise<InviteData> {
  const now = Date.now();
  const max_scans = params.max_scans ?? 1;
  const ttl_hours = params.ttl_hours ?? 24;
  const code = generateInviteCode();

  const invite: InviteData = {
    code,
    creator_hash: hashToken(creatorToken),
    remark: params.remark?.trim() ?? "",
    max_scans,
    ttl_hours,
    expires_at: now + ttl_hours * 60 * 60 * 1000,
    created_at: now,
    disabled: false,
  };

  await env.BACKENDS.put(`invite:${code}`, JSON.stringify(invite));
  return invite;
}

export async function getInvite(env: Env, code: string): Promise<InviteData | null> {
  return await env.BACKENDS.get(`invite:${code}`, "json") as InviteData | null;
}

async function listKeyNames(env: Env, prefix: string): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await env.BACKENDS.list({ prefix, cursor });
    names.push(...result.keys.map((key) => key.name));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return names;
}

export async function listInvites(env: Env): Promise<InviteListEntry[]> {
  const keys = await listKeyNames(env, "invite:");
  const invites: InviteListEntry[] = [];

  for (const keyName of keys) {
    // Skip invite_usage:* and invite_qr:* sub-keys
    if (keyName.startsWith("invite_usage:") || keyName.startsWith("invite_qr:")) continue;
    const raw = await env.BACKENDS.get(keyName, "json") as InviteData | null;
    if (!raw) continue;
    // scan_count derived from usage records
    const usageRecords = await getUsageRecords(env, raw.code);
    invites.push({
      code: raw.code,
      remark: raw.remark,
      max_scans: raw.max_scans,
      scan_count: usageRecords.length,
      ttl_hours: raw.ttl_hours,
      expires_at: raw.expires_at,
      created_at: raw.created_at,
      disabled: raw.disabled,
    });
  }

  // Sort by created_at descending (newest first)
  invites.sort((a, b) => b.created_at - a.created_at);
  return invites;
}

export async function getInviteDetail(env: Env, code: string): Promise<InviteDetail | null> {
  const invite = await getInvite(env, code);
  if (!invite) return null;

  const records = await getUsageRecords(env, code);

  return {
    code: invite.code,
    remark: invite.remark,
    max_scans: invite.max_scans,
    scan_count: records.length,
    ttl_hours: invite.ttl_hours,
    expires_at: invite.expires_at,
    created_at: invite.created_at,
    disabled: invite.disabled,
    scan_records: records,
  };
}

export async function deleteInvite(env: Env, code: string): Promise<void> {
  await env.BACKENDS.delete(`invite:${code}`);
  await env.BACKENDS.delete(`invite_qr:${code}`);
  // Clean up usage records (one key per record)
  const keys = await listKeyNames(env, `invite_usage:${code}:`);
  await Promise.all(keys.map((keyName) => env.BACKENDS.delete(keyName)));
}

export async function setInviteDisabled(
  env: Env,
  code: string,
  disabled: boolean,
): Promise<InviteData | null> {
  const invite = await getInvite(env, code);
  if (!invite) return null;

  invite.disabled = disabled;
  await env.BACKENDS.put(`invite:${code}`, JSON.stringify(invite));
  return invite;
}

// ── Usage Records ──────────────────────────────────────────────────────────

export async function getUsageRecords(env: Env, code: string): Promise<UsageRecord[]> {
  const keys = await listKeyNames(env, `invite_usage:${code}:`);
  const records: UsageRecord[] = [];
  for (const keyName of keys) {
    const raw = await env.BACKENDS.get(keyName, "json") as UsageRecord | null;
    if (raw) records.push(raw);
  }
  records.sort((a, b) => a.used_at - b.used_at);
  return records;
}

export async function addUsageRecord(
  env: Env,
  code: string,
  record: UsageRecord,
): Promise<void> {
  // Use bound_bot_id as part of key to ensure idempotency — a bot can
  // only be bound once per invite, preventing duplicate records from
  // concurrent poll requests.
  const key = `invite_usage:${code}:${record.bound_bot_id}`;
  await env.BACKENDS.put(key, JSON.stringify(record));
}

// ── Invite Status ──────────────────────────────────────────────────────────

export type InviteStatus = "ok" | "expired" | "exhausted" | "disabled" | "not_found";

export function checkInviteStatus(invite: InviteData | null, usageCount = 0): InviteStatus {
  if (!invite) return "not_found";
  if (invite.disabled) return "disabled";
  if (Date.now() > invite.expires_at) return "expired";
  if (usageCount >= invite.max_scans) return "exhausted";
  return "ok";
}

export function statusMessage(status: InviteStatus): string {
  switch (status) {
    case "not_found": return "邀请不存在";
    case "disabled": return "邀请已被禁用";
    case "expired": return "邀请已过期";
    case "exhausted": return "邀请已用完";
    case "ok": return "";
  }
}

// ── Public Page HTML ───────────────────────────────────────────────────────

export function renderInvitePage(
  code: string,
  status: InviteStatus,
): Response {
  const msg = statusMessage(status);
  const isDisabled = status !== "ok";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>WeClaw Hub · 机器人绑定邀请</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI","PingFang SC",sans-serif;background:#f4efe6;min-height:100vh;display:grid;place-items:center}
.card{background:#fffaf2;border:1px solid rgba(74,57,44,0.12);border-radius:24px;padding:32px 36px;width:min(400px,calc(100% - 32px));box-shadow:0 24px 60px rgba(61,39,22,0.12);text-align:center}
h1{margin:0 0 4px;font-size:24px}
.sub{color:#6f6258;font-size:14px;margin-bottom:24px}
.qr-container{margin:20px auto;position:relative;display:inline-block}
.qr-container img{display:block;max-width:220px;height:auto}
.qr-container svg{display:block;max-width:220px;height:auto;margin:0 auto}
.error-overlay{position:absolute;inset:0;background:rgba(255,250,242,0.9);display:flex;align-items:center;justify-content:center;border-radius:16px}
.error-overlay p{color:#b6542d;font-weight:600;font-size:15px;margin:0;padding:20px}
.error-block{min-width:220px;min-height:100px;display:flex;align-items:center;justify-content:center;background:rgba(255,250,242,0.9);border:1px solid rgba(74,57,44,0.08);border-radius:16px}
.error-block p{color:#b6542d;font-weight:600;font-size:15px;margin:0;padding:20px}
.status-text{margin-top:16px;font-size:13px;color:#888}
#qr-container-inner{margin:0 auto;display:inline-block}
</style>
</head>
<body>
<div class="card">
  <h1>WeClaw Hub</h1>
  <p class="sub">扫描二维码绑定机器人</p>
  <div class="qr-container${isDisabled ? "" : ""}">
    ${isDisabled
      ? `<div class="error-block"><p>${msg}</p></div>`
      : `<div id="qr-container-inner">加载中...</div>`
    }
  </div>
  ${isDisabled
    ? `<p class="status-text">${msg}</p>`
    : `<p class="status-text" id="status-text">正在获取二维码...</p>`
  }
</div>
${isDisabled ? "" : `
<script>
(function() {
  var code = ${JSON.stringify(code)};
  var origin = location.origin;
  var statusText = document.getElementById("status-text");
  var qrContainer = document.getElementById("qr-container-inner");
  var polling = false;
  var pollTimer = null;

  function loadQR() {
    fetch(origin + "/invite/" + code + "/qr")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.qrcode_svg) {
          qrContainer.innerHTML = data.qrcode_svg;
        } else if (data.qrcode_img_content) {
          qrContainer.innerHTML = '<img src="' + data.qrcode_img_content + '" alt="QR" />';
        }
        startPolling();
      })
      .catch(function(err) {
        qrContainer.innerHTML = "无法加载二维码: " + err.message;
      });
  }

  function refreshQR() {
    fetch(origin + "/invite/" + code + "/qr")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.qrcode_svg) {
          qrContainer.innerHTML = data.qrcode_svg;
        } else if (data.qrcode_img_content) {
          qrContainer.innerHTML = '<img src="' + data.qrcode_img_content + '" alt="QR" />';
        }
      });
  }

  function startPolling() {
    if (polling) return;
    polling = true;
    pollTimer = setInterval(poll, 2000);
    poll();
  }

  function poll() {
    fetch(origin + "/invite/" + code + "/status")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.expired) {
          statusText.textContent = "二维码已过期，正在刷新...";
          refreshQR();
        } else if (data.status === "confirmed") {
          statusText.textContent = "绑定成功！";
          clearInterval(pollTimer);
          setTimeout(function() { location.reload(); }, 3000);
        } else if (data.status === "scaned") {
          statusText.textContent = "已扫码，请在微信上确认...";
        } else if (data.status === "scaned_but_redirect") {
          statusText.textContent = "已扫码，请在新页面确认...";
        } else {
          statusText.textContent = "等待扫码...";
        }
      });
  }

  loadQR();
})();
</script>`}
</body>
</html>`;

  return new Response(html, {
    status: isDisabled ? 200 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Public invite page — renders HTML for /invite/:code
 */
export async function handleInvitePage(
  env: Env,
  code: string,
): Promise<Response> {
  const invite = await getInvite(env, code);
  const records = invite ? await getUsageRecords(env, code) : [];
  const status = checkInviteStatus(invite, records.length);
  return renderInvitePage(code, status);
}

/**
 * Public QR code — returns QR data for /invite/:code/qr
 */
export async function handleInviteQR(
  env: Env,
  code: string,
): Promise<Response> {
  const invite = await getInvite(env, code);
  const records = invite ? await getUsageRecords(env, code) : [];
  const status = checkInviteStatus(invite, records.length);
  if (status !== "ok") {
    return new Response(JSON.stringify({ error: statusMessage(status) }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const qr = await fetchQRCode();
    // Store qrcode in KV so the status endpoint can poll it
    await env.BACKENDS.put(`invite_qr:${code}`, qr.qrcode);
    return new Response(JSON.stringify({
      ...qr,
      qrcode_svg: renderQrSvg(qr.qrcode_img_content),
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[invite/qr] fetch failed", err);
    return new Response(JSON.stringify({ error: "upstream_error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Public polling — returns status for /invite/:code/status
 */
export async function handleInviteStatus(
  env: Env,
  code: string,
  botSession: DurableObjectNamespace,
): Promise<Response> {
  const invite = await getInvite(env, code);
  const records = invite ? await getUsageRecords(env, code) : [];
  const status = checkInviteStatus(invite, records.length);

  if (status !== "ok") {
    return new Response(JSON.stringify({ error: statusMessage(status), status: status }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Retrieve the stored qrcode; if not found, return a pending status
    const qrcode = await env.BACKENDS.get(`invite_qr:${code}`);
    if (!qrcode) {
      return new Response(JSON.stringify({ status: "wait", expired: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Quick poll with 5s timeout — iLink is slow, don't block the page
    let result: QRStatusResponse;
    try {
      result = await quickPollQRStatus(qrcode, undefined);
    } catch (pollErr) {
      // iLink poll may timeout; return wait status so frontend retries
      return new Response(JSON.stringify({
        status: "wait",
        expired: false,
      }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // When confirmed, persist to DO and record usage
    if (result.status === "confirmed" && result.bot_token && result.ilink_bot_id) {
      // Serialize consumption per invite code so max_scans cannot be exceeded
      // by concurrent confirmations from different bots.
      const lockId = botSession.idFromName(`__invite_consume:${code}`);
      const lockStub = botSession.get(lockId);
      const consumeRes = await lockStub.fetch(new Request("http://do/__internal/consume-invite", {
        method: "POST",
        body: JSON.stringify({
          code,
          bot_token: result.bot_token,
          ilink_bot_id: result.ilink_bot_id,
          baseurl: result.baseurl ?? result.base_url ?? "",
          ilink_user_id: result.ilink_user_id ?? "",
        }),
      }));
      if (!consumeRes.ok) {
        const data = await consumeRes.json().catch(() => ({})) as { status?: string; error?: string };
        return new Response(JSON.stringify({
          error: data.error ?? "consume_failed",
          status: data.status ?? "error",
        }), {
          status: consumeRes.status === 409 ? 403 : 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Return a simplified status object
    return new Response(JSON.stringify({
      status: result.status,
      expired: result.status === "expired",
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[invite/status] poll failed", err);
    return new Response(JSON.stringify({ error: "upstream_error", status: "error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
