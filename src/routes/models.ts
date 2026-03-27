import { Hono } from "hono";
import type { Env } from "../env.ts";
import type { CustomModel, LlmProvider } from "../types.ts";

export const modelRoutes = new Hono<{ Bindings: Env }>();

modelRoutes.get("/api/models", async (c) => {
  const models = await loadModels(c.env);
  const providers = (await c.env.BACKENDS.get("llm:providers", "json") as LlmProvider[] | null) ?? [];
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const activeName = await c.env.BACKENDS.get("llm:active");
  return c.json({
    models: models.map((model) => {
      const provider = providerById.get(model.providerId);
      return {
        ...model,
        baseUrl: provider?.baseUrl,
        hasApiKey: !!provider?.apiKey,
      };
    }),
    activeName: activeName ?? models[0]?.displayName ?? null,
  });
});

modelRoutes.post("/api/models", async (c) => {
  const body = (await c.req.json()) as Partial<CustomModel> & { providerId?: string };
  const model = await normalizeModel(c.env, body);
  if (typeof model === "string") return c.json({ error: model }, 400);

  const models = await loadModels(c.env);
  if (models.some((item) => item.displayName === model.displayName)) {
    return c.json({ error: "model name already exists" }, 409);
  }

  models.push(model);
  await c.env.BACKENDS.put("llm:models", JSON.stringify(models));
  return c.json({ ok: true, model: maskModel(model) });
});

modelRoutes.post("/api/models/import", async (c) => {
  const body = (await c.req.json()) as {
    providerId?: string;
    models?: Array<{ model?: string; displayName?: string }>;
  };
  const providerId = body.providerId?.trim();
  if (!providerId || !body.models?.length) return c.json({ error: "missing providerId or models" }, 400);

  const models = await loadModels(c.env);
  let imported = 0;
  let skipped = 0;
  for (const item of body.models) {
    const modelId = item.model?.trim();
    const displayName = item.displayName?.trim();
    if (!modelId || !displayName) continue;
    if (models.some((existing) => existing.displayName === displayName)) {
      skipped++;
      continue;
    }
    models.push({ model: modelId, displayName, providerId, role: null });
    imported++;
  }

  await c.env.BACKENDS.put("llm:models", JSON.stringify(models));
  return c.json({ ok: true, imported, skipped });
});

modelRoutes.put("/api/models/active", async (c) => {
  const body = (await c.req.json()) as { name?: string };
  if (!body.name) return c.json({ error: "missing name" }, 400);
  const models = await loadModels(c.env);
  if (!models.some((model) => model.displayName === body.name)) return c.json({ error: "model not found" }, 404);
  await c.env.BACKENDS.put("llm:active", body.name);
  return c.json({ ok: true, activeName: body.name });
});

modelRoutes.put("/api/models/:name", async (c) => {
  const rawName = decodeURIComponent(c.req.param("name"));
  const models = await loadModels(c.env);
  const index = models.findIndex((model) => model.displayName === rawName);
  if (index === -1) return c.json({ error: "not found" }, 404);

  const body = (await c.req.json()) as Partial<CustomModel> & { providerId?: string };
  const existing = models[index]!;
  const updated: CustomModel = {
    ...existing,
    model: body.model?.trim() ?? existing.model,
    displayName: body.displayName?.trim() ?? existing.displayName,
    providerId: body.providerId?.trim() ?? existing.providerId,
    role: body.role !== undefined ? body.role : existing.role ?? null,
    maxOutputTokens: body.maxOutputTokens !== undefined ? body.maxOutputTokens : existing.maxOutputTokens,
  };

  if (updated.displayName !== rawName && models.some((model, pos) => pos !== index && model.displayName === updated.displayName)) {
    return c.json({ error: "model name already exists" }, 409);
  }

  models[index] = updated;
  await c.env.BACKENDS.put("llm:models", JSON.stringify(models));
  if (updated.displayName !== rawName) {
    const activeName = await c.env.BACKENDS.get("llm:active");
    if (activeName === rawName) await c.env.BACKENDS.put("llm:active", updated.displayName);
  }
  return c.json({ ok: true, model: maskModel(updated) });
});

modelRoutes.delete("/api/models/:name", async (c) => {
  const rawName = decodeURIComponent(c.req.param("name"));
  const models = await loadModels(c.env);
  const filtered = models.filter((model) => model.displayName !== rawName);
  if (filtered.length === models.length) return c.json({ error: "not found" }, 404);

  await c.env.BACKENDS.put("llm:models", JSON.stringify(filtered));
  const activeName = await c.env.BACKENDS.get("llm:active");
  if (activeName === rawName) await c.env.BACKENDS.delete("llm:active");
  return c.json({ ok: true });
});

async function loadModels(env: Env): Promise<CustomModel[]> {
  return (await env.BACKENDS.get("llm:models", "json") as CustomModel[] | null) ?? [];
}

function maskModel(model: CustomModel) {
  return { ...model, hasApiKey: true };
}

async function normalizeModel(
  env: Env,
  body: Partial<CustomModel> & { providerId?: string },
): Promise<CustomModel | string> {
  const modelId = body.model?.trim();
  const displayName = body.displayName?.trim();
  const providerId = body.providerId?.trim();
  if (!modelId || !displayName || !providerId) return "missing required fields: model, displayName, providerId";

  const providers = (await env.BACKENDS.get("llm:providers", "json") as LlmProvider[] | null) ?? [];
  if (!(providers ?? []).some((provider) => provider.id === providerId)) return "provider not found";

  return {
    model: modelId,
    displayName,
    providerId,
    role: body.role ?? null,
    maxOutputTokens: body.maxOutputTokens,
  };
}