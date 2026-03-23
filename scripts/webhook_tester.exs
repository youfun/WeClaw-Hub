#!/usr/bin/env elixir
# WeClaw Hub — Webhook Tester
# Usage: elixir scripts/webhook_tester.exs
#
# Opens a web UI at http://localhost:4040 for testing deployed webhooks.

Mix.install([
  {:phoenix_playground, "~> 0.1.8"},
  {:req, "~> 0.5"},
  {:jason, "~> 1.4"}
])

defmodule WebhookTester.Live do
  use Phoenix.LiveView

  # ---- Default payloads matched to each parser ----

  defp default_payload("github", "push") do
    Jason.encode!(%{
      ref: "refs/heads/main",
      repository: %{full_name: "user/repo"},
      head_commit: %{message: "fix: test push"},
      commits: [%{id: "abc1234", message: "fix: test push"}]
    }, pretty: true)
  end

  defp default_payload("github", "pull_request") do
    Jason.encode!(%{
      action: "opened",
      number: 42,
      pull_request: %{number: 42, title: "Test PR"},
      repository: %{full_name: "user/repo"}
    }, pretty: true)
  end

  defp default_payload("github", "issues") do
    Jason.encode!(%{
      action: "opened",
      issue: %{number: 1, title: "Test issue"},
      repository: %{full_name: "user/repo"}
    }, pretty: true)
  end

  defp default_payload("github", "ping") do
    Jason.encode!(%{
      zen: "Non-blocking is better than blocking.",
      hook_id: 1,
      repository: %{full_name: "user/repo"}
    }, pretty: true)
  end



  # Generic parser: picks up text / message / content field
  defp default_payload(_, _) do
    Jason.encode!(%{text: "测试消息 — webhook tester"}, pretty: true)
  end

  # ---- LiveView ----

  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       url: "",
       auth_mode: "bearer",
       secret: "",
       source: "generic",
       github_event: "push",
       payload: default_payload("generic", nil),
       status: nil,
       resp_body: nil,
       sending: false,
       req_headers: nil
     )}
  end

  def render(assigns) do
    ~H"""
    <script src="https://cdn.tailwindcss.com"></script>
    <div class="max-w-2xl mx-auto px-4 py-8 font-sans">

      <div class="mb-6">
        <h1 class="text-xl font-bold">Webhook Tester</h1>
        <p class="text-sm text-gray-500 mt-1">WeClaw Hub — 测试已部署的 Webhook 端点</p>
      </div>

      <form phx-submit="send" class="space-y-4">

        <%# URL %>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Webhook URL
          </label>
          <input name="url" type="url" value={@url} autocomplete="off"
            placeholder="https://xxx.workers.dev/webhooks/abc123"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <%# Auth mode + Source type %>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              验证方式
            </label>
            <select name="auth_mode" phx-change="change_auth"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="bearer" selected={@auth_mode == "bearer"}>Bearer Token</option>
              <option value="hmac"   selected={@auth_mode == "hmac"}>HMAC-SHA256</option>
              <option value="none"   selected={@auth_mode == "none"}>无验证</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              来源类型 (source)
            </label>
            <select name="source" phx-change="change_source"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="generic"  selected={@source == "generic"}>Generic</option>
              <option value="github"   selected={@source == "github"}>GitHub</option>
            </select>
          </div>
        </div>

        <%# Secret / token %>
        <div :if={@auth_mode != "none"}>
          <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            <%= if @auth_mode == "bearer", do: "Bearer Token", else: "HMAC Secret" %>
          </label>
          <input name="secret" type="text" value={@secret} autocomplete="off"
            placeholder="your-token-or-secret"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>

        <%# GitHub event selector %>
        <div :if={@source == "github"}>
          <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            X-GitHub-Event
          </label>
          <select name="github_event" phx-change="change_github_event"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="push"         selected={@github_event == "push"}>push</option>
            <option value="pull_request" selected={@github_event == "pull_request"}>pull_request</option>
            <option value="issues"       selected={@github_event == "issues"}>issues</option>
            <option value="ping"         selected={@github_event == "ping"}>ping</option>
          </select>
        </div>

        <%# Payload %>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Payload (JSON)
          </label>
          <textarea name="payload" rows="10"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"><%= @payload %></textarea>
        </div>

        <button type="submit" disabled={@sending}
          class="w-full py-2.5 rounded-lg font-semibold text-sm transition-colors
                 bg-green-600 hover:bg-green-700 text-white
                 disabled:bg-gray-300 disabled:cursor-not-allowed">
          <%= if @sending, do: "发送中…", else: "发送请求" %>
        </button>
      </form>

      <%# Request headers preview %>
      <div :if={@req_headers} class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">发送的请求头</div>
        <pre class="text-xs text-gray-600 font-mono"><%= @req_headers %></pre>
      </div>

      <%# Response %>
      <div :if={@status != nil} class={"mt-4 rounded-lg border p-4 " <>
        if(@status in 200..299, do: "border-green-300 bg-green-50", else: "border-red-300 bg-red-50")}>
        <div class={"text-sm font-bold mb-2 " <>
          if(@status in 200..299, do: "text-green-700", else: "text-red-700")}>
          <%= if @status == 0, do: "连接失败", else: "HTTP #{@status}" %>
        </div>
        <pre class="text-xs overflow-auto whitespace-pre-wrap break-words font-mono"><%= @resp_body %></pre>
      </div>

    </div>
    """
  end

  # ---- Event handlers ----

  def handle_event("change_auth", %{"auth_mode" => mode}, socket) do
    {:noreply, assign(socket, auth_mode: mode)}
  end

  def handle_event("change_source", %{"source" => source}, socket) do
    event = socket.assigns.github_event
    {:noreply, assign(socket, source: source, payload: default_payload(source, event))}
  end

  def handle_event("change_github_event", %{"github_event" => event}, socket) do
    {:noreply, assign(socket, github_event: event, payload: default_payload("github", event))}
  end

  def handle_event("send", params, socket) do
    url         = String.trim(params["url"] || "")
    secret      = params["secret"] || ""
    raw_payload = params["payload"] || ""
    source      = params["source"] || "generic"
    auth        = params["auth_mode"] || "bearer"
    event       = params["github_event"] || socket.assigns.github_event

    socket = assign(socket,
      url: url, secret: secret, payload: raw_payload,
      source: source, auth_mode: auth, github_event: event,
      sending: true, status: nil, resp_body: nil, req_headers: nil
    )

    if url == "" do
      {:noreply, assign(socket, sending: false, status: 0, resp_body: "请填写 Webhook URL")}
    else
      headers =
        [{"content-type", "application/json"}]
        |> add_auth(auth, secret, raw_payload)
        |> add_source_headers(source, event)

      headers_preview = Enum.map_join(headers, "\n", fn {k, v} ->
        masked = if k == "authorization", do: mask_value(v), else: v
        "#{k}: #{masked}"
      end)

      {status, body} =
        case Req.post(url, body: raw_payload, headers: headers, receive_timeout: 15_000) do
          {:ok, resp}    -> {resp.status, format_body(resp.body)}
          {:error, err}  -> {0, Exception.message(err)}
        end

      {:noreply,
       assign(socket,
         sending: false,
         status: status,
         resp_body: body,
         req_headers: headers_preview
       )}
    end
  end

  # ---- Helpers ----

  defp add_auth(headers, "bearer", secret, _payload) do
    [{"authorization", "Bearer #{secret}"} | headers]
  end

  defp add_auth(headers, "hmac", secret, payload) do
    sig = :crypto.mac(:hmac, :sha256, secret, payload) |> Base.encode16(case: :lower)
    [{"x-hub-signature-256", "sha256=#{sig}"} | headers]
  end

  defp add_auth(headers, _, _, _), do: headers

  defp add_source_headers(headers, "github", event) do
    [{"x-github-event", event} | headers]
  end

  defp add_source_headers(headers, _, _), do: headers

  defp format_body(body) when is_map(body) or is_list(body) do
    Jason.encode!(body, pretty: true)
  end

  defp format_body(body), do: to_string(body)

  defp mask_value("Bearer " <> token) when byte_size(token) > 8 do
    "Bearer " <> String.slice(token, 0, 4) <> "****"
  end

  defp mask_value(v), do: v
end

IO.puts("""
┌─────────────────────────────────────────┐
│  WeClaw Webhook Tester                  │
│  http://localhost:4040                  │
└─────────────────────────────────────────┘
""")

PhoenixPlayground.start(live: WebhookTester.Live, port: 4040)
