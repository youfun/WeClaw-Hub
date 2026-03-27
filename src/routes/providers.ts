import { Hono } from "hono";
import type { Env } from "../env.ts";
import type { LlmProvider, ProviderModelOption } from "../types.ts";

export const providerRoutes = new Hono<{ Bindings: Env }>();

providerRoutes.get("/api/providers", async (c) => {
  const providers = await loadProviders(c.env);
  return c.json({ providers: providers.map(maskProvider) });
});

providerRoutes.post("/api/providers", async (c) => {
  const body = (await c.req.json()) as Partial<LlmProvider>;
  const provider = normalizeProvider(body);
  if (typeof provider === "string") return c.json({ error: provider }, 400);

  const providers = await loadProviders(c.env);
  if (providers.some((item) => item.id === provider.id)) {
    return c.json({ error: "provider already exists" }, 409);
  }

  providers.push(provider);
  await c.env.BACKENDS.put("llm:providers", JSON.stringify(providers));
  return c.json({ ok: true, provider: maskProvider(provider) });
});

providerRoutes.put("/api/providers/:id", async (c) => {
  const providerId = decodeURIComponent(c.req.param("id"));
  const providers = await loadProviders(c.env);
  const index = providers.findIndex((provider) => provider.id === providerId);
  if (index === -1) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json()) as Partial<LlmProvider>;
  const next = { ...providers[index]!, ...cleanProviderUpdate(body, providers[index]!) };
  providers[index] = next;
  await c.env.BACKENDS.put("llm:providers", JSON.stringify(providers));
  return c.json({ ok: true, provider: maskProvider(next) });
});

providerRoutes.delete("/api/providers/:id", async (c) => {
  const providerId = decodeURIComponent(c.req.param("id"));
  const providers = await loadProviders(c.env);
  const filtered = providers.filter((provider) => provider.id !== providerId);
  if (filtered.length === providers.length) return c.json({ error: "not found" }, 404);

  await c.env.BACKENDS.put("llm:providers", JSON.stringify(filtered));
  return c.json({ ok: true });
});

providerRoutes.get("/api/providers/:id/models", async (c) => {
  const providerId = decodeURIComponent(c.req.param("id"));
  const providers = await loadProviders(c.env);
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) return c.json({ error: "not found" }, 404);

  if (provider.type === "anthropic") {
    return c.json({
      models: [
        { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5" },
        { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
      ] satisfies ProviderModelOption[],
    });
  }

  if (!provider.baseUrl) return c.json({ error: "missing baseUrl" }, 400);
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${resolveApiKey(c.env, provider.apiKey)}` },
  });
  if (!response.ok) return c.json({ error: "upstream_error" }, 502);

  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  return c.json({
    models: (payload.data ?? []).flatMap((item) => (item.id ? [{ id: item.id, name: item.id }] : [])),
  });
});

function loadProviders(env: Env): Promise<LlmProvider[]> {
  return env.BACKENDS.get("llm:providers", "json").then((value) => (value as LlmProvider[] | null) ?? []);
}

function maskProvider(provider: LlmProvider) {
  const { apiKey: _apiKey, ...rest } = provider;
  return { ...rest, hasApiKey: !!provider.apiKey };
}

function normalizeProvider(body: Partial<LlmProvider>): LlmProvider | string {
  const id = body.id?.trim();
  const name = body.name?.trim();
  const type = body.type;
  const apiKey = body.apiKey?.trim();
  if (!id || !name || !type || !apiKey) return "missing required fields: id, name, type, apiKey";
  if (type !== "anthropic" && type !== "openai-compat") return "invalid provider type";
  return {
    id,
    name,
    type,
    baseUrl: body.baseUrl?.trim() || undefined,
    apiKey,
    defaultMaxOutputTokens: body.defaultMaxOutputTokens,
  };
}

function cleanProviderUpdate(body: Partial<LlmProvider>, existing: LlmProvider): Partial<LlmProvider> {
  const next: Partial<LlmProvider> = {};
  if (body.name !== undefined) next.name = body.name.trim();
  if (body.type !== undefined) next.type = body.type;
  if (body.baseUrl !== undefined) next.baseUrl = body.baseUrl.trim() || undefined;
  if (body.apiKey !== undefined) next.apiKey = body.apiKey.trim() || existing.apiKey;
  if (body.defaultMaxOutputTokens !== undefined) next.defaultMaxOutputTokens = body.defaultMaxOutputTokens;
  return next;
}

function resolveApiKey(env: Env, value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => (env as unknown as Record<string, string>)[name] ?? "");
}