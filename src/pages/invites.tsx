/** @jsxImportSource hono/jsx */

import { renderPage, Section, EmptyState, Chip } from "./layout.tsx";
import type { InviteListEntry, UsageRecord } from "../invites.ts";

type InvitePageProps = {
  invites: InviteListEntry[];
  origin: string;
};

export function invitePage(props: InvitePageProps): Response {
  return renderPage({
    title: "邀请绑定",
    subtitle: "生成分享链接，他人扫码即可绑定自己的机器人。",
    activeNav: "admin",
    children: (
      <>
        {/* Create form */}
        <Section
          title="新建邀请"
          dot="add"
        >
          <form id="invite-form" class="card stack">
            <div class="form-grid">
              <div class="field">
                <label>最大扫码次数</label>
                <input name="max_scans" type="number" min="1" max="100" value="1" />
              </div>
              <div class="field">
                <label>有效期（小时）</label>
                <select name="ttl_hours">
                  <option value="1">1 小时</option>
                  <option value="6">6 小时</option>
                  <option value="24" selected>24 小时</option>
                  <option value="72">3 天</option>
                  <option value="168">7 天</option>
                </select>
              </div>
              <div class="field">
                <label>备注</label>
                <input name="remark" placeholder="例如：家庭邀请" />
              </div>
            </div>
            <div class="inline">
              <button class="primary" type="submit">生成邀请链接</button>
            </div>
          </form>
          <div id="invite-result" class="card mt-3 hidden">
            <strong>邀请已生成</strong>
            <p class="meta mt-2">链接：<a id="invite-link" href="#" target="_blank" style="word-break:break-all"></a></p>
            <div id="invite-qr" class="mt-3"></div>
            <button class="button mt-2" type="button" id="copy-invite-link">复制链接</button>
            <button class="button mt-2" type="button" id="close-invite-result">关闭</button>
          </div>
        </Section>

        {/* Invite list */}
        <Section
          title="邀请记录"
          description="已生成的所有邀请及扫码记录。"
          dot="list"
        >
          <div class="grid">
            {props.invites.length ? props.invites.map((inv) => (
              <div class="row mt-3" style="flex-direction:column;align-items:stretch">
                <div class="flex items-center justify-between">
                  <div>
                    <strong>{inv.remark || "(无备注)"}</strong>
                    <div class="meta">
                      <Chip
                        color={inviteStatusColor(inv)}
                        text={inviteStatusText(inv)}
                      />
                      <span class="code-inline" style="user-select:all">{inv.code}</span>
                      <span>{inv.scan_count}/{inv.max_scans} 次</span>
                    </div>
                  </div>
                  <div class="inline">
                    <button class="button" type="button" data-toggle-usage={inv.code}>
                      <span class="usage-label">展开记录</span>
                    </button>
                    {!inv.disabled && inv.scan_count < inv.max_scans && Date.now() < inv.expires_at
                      ? <button class="button" type="button" data-disable-invite={inv.code}>禁用</button>
                      : inv.disabled
                        ? <button class="button" type="button" data-enable-invite={inv.code}>启用</button>
                        : null
                    }
                    <button class="button" type="button" data-delete-invite={inv.code}>删除</button>
                  </div>
                </div>
                <div id={`usage-${inv.code}`} class="hidden mt-3 pt-3" style="border-top:1px solid var(--line)">
                  <div id={`usage-list-${inv.code}`} class="usage-loading">加载中...</div>
                </div>
              </div>
            )) : <EmptyState text="暂无邀请记录。" />}
          </div>
        </Section>

        <script dangerouslySetInnerHTML={{ __html: buildInviteScript(props.origin) }} />
      </>
    ),
  });
}

function inviteStatusColor(inv: InviteListEntry): "brand" | "terminal" | "purple" | "blue" | "wechat" | "amber" {
  if (inv.disabled) return "wechat";
  if (Date.now() > inv.expires_at) return "amber";
  if (inv.scan_count >= inv.max_scans) return "amber";
  return "terminal";
}

function inviteStatusText(inv: InviteListEntry): string {
  if (inv.disabled) return "已禁用";
  if (Date.now() > inv.expires_at) return "已过期";
  if (inv.scan_count >= inv.max_scans) return "已用完";
  return "有效";
}

function buildInviteScript(origin: string): string {
  return `
function getAuthToken() {
  var match = document.cookie.match(/(?:^|;\\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function api(method, path, body) {
  var token = getAuthToken();
  var headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  var res = await fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    window.location.assign("/auth?redirect=" + encodeURIComponent(window.location.pathname));
    return new Promise(function() {});
  }
  if (!res.ok) {
    var data = await res.json().catch(function() { return {}; });
    throw new Error(data.error || "request_failed");
  }
  return res.json().catch(function() { return {}; });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Create invite ──
document.getElementById("invite-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var form = e.currentTarget;
  var fd = new FormData(form);
  var body = {
    max_scans: parseInt(fd.get("max_scans"), 10),
    ttl_hours: parseInt(fd.get("ttl_hours"), 10),
    remark: fd.get("remark") || "",
  };
  var btn = form.querySelector("button");
  btn.disabled = true;
  btn.textContent = "生成中...";
  try {
    var data = await api("POST", "/api/invites", body);
    showInviteResult(data);
  } catch (err) {
    alert("创建失败: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = "生成邀请链接";
});

function showInviteResult(data) {
  var result = document.getElementById("invite-result");
  var link = document.getElementById("invite-link");
  var qrDiv = document.getElementById("invite-qr");
  var url = location.origin + "/invite/" + data.code;
  link.href = url;
  link.textContent = url;
  result.classList.remove("hidden");

  // Load QR code
  fetch(url + "/qr")
    .then(function(r) { return r.json(); })
    .then(function(qr) {
      if (qr.qrcode_svg) {
        qrDiv.innerHTML = '<div class="mx-auto" style="max-width:200px">' + qr.qrcode_svg + '</div>';
      }
    })
    .catch(function() {});

  document.getElementById("copy-invite-link").onclick = function() {
    navigator.clipboard.writeText(url).then(function() {
      alert("已复制到剪贴板");
    });
  };
  document.getElementById("close-invite-result").onclick = function() {
    result.classList.add("hidden");
  };
}

// ── Toggle usage records ──
document.querySelectorAll("[data-toggle-usage]").forEach(function(btn) {
  btn.addEventListener("click", async function() {
    var code = btn.getAttribute("data-toggle-usage");
    var usageDiv = document.getElementById("usage-" + code);
    var label = btn.querySelector(".usage-label");

    if (usageDiv.classList.contains("hidden")) {
      usageDiv.classList.remove("hidden");
      label.textContent = "收起记录";
      var listDiv = document.getElementById("usage-list-" + code);
      try {
        var detail = await api("GET", "/api/invites/" + code);
        var records = detail.scan_records || [];
        if (records.length === 0) {
          listDiv.innerHTML = '<p class="meta">暂无扫码记录。</p>';
        } else {
          listDiv.innerHTML = '<table style="width:100%;font-size:13px"><thead><tr><th style="text-align:left">时间</th><th style="text-align:left">绑定 Bot</th><th style="text-align:left">用户 ID</th><th>结果</th></tr></thead><tbody>' +
            records.map(function(r) {
              var time = escapeHtml(new Date(r.used_at).toLocaleString("zh-CN"));
              var ok = r.success ? "✅ 成功" : "❌ 失败";
              return "<tr><td>" + time + "</td><td style='font-family:monospace;font-size:12px'>" + escapeHtml(r.bound_bot_id) + "</td><td style='font-family:monospace;font-size:12px'>" + escapeHtml(r.ilink_user_id) + "</td><td>" + ok + "</td></tr>";
            }).join("") + "</tbody></table>";
        }
      } catch (err) {
        listDiv.innerHTML = '<p class="meta">加载失败: ' + escapeHtml(err.message) + '</p>';
      }
    } else {
      usageDiv.classList.add("hidden");
      label.textContent = "展开记录";
    }
  });
});

// ── Disable/Enable ──
document.querySelectorAll("[data-disable-invite]").forEach(function(btn) {
  btn.addEventListener("click", async function() {
    var code = btn.getAttribute("data-disable-invite");
    if (!confirm("确定要禁用该邀请吗？")) return;
    try {
      await api("PUT", "/api/invites/" + code + "/disable");
      location.reload();
    } catch (err) {
      alert("操作失败: " + err.message);
    }
  });
});
document.querySelectorAll("[data-enable-invite]").forEach(function(btn) {
  btn.addEventListener("click", async function() {
    var code = btn.getAttribute("data-enable-invite");
    try {
      await api("PUT", "/api/invites/" + code + "/enable");
      location.reload();
    } catch (err) {
      alert("操作失败: " + err.message);
    }
  });
});

// ── Delete ──
document.querySelectorAll("[data-delete-invite]").forEach(function(btn) {
  btn.addEventListener("click", async function() {
    var code = btn.getAttribute("data-delete-invite");
    if (!confirm("确定要删除该邀请及其所有记录吗？")) return;
    try {
      await api("DELETE", "/api/invites/" + code);
      location.reload();
    } catch (err) {
      alert("删除失败: " + err.message);
    }
  });
});
`;
}
