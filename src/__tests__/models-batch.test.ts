/**
 * TDD: POST /api/models/batch — batch import models with roles
 *
 * Phase 1: RED — write failing tests first
 * Phase 2: GREEN — implement the endpoint
 */

import { afterEach, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";

const AUTH = "Bearer test-token";

async function batchImport(models: Array<{
  providerId: string;
  model: string;
  displayName: string;
  role?: string | null;
}>) {
  return SELF.fetch("http://localhost/api/models/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify({ models }),
  });
}

async function listModels() {
  const res = await SELF.fetch("http://localhost/api/models", {
    headers: { Authorization: AUTH },
  });
  return res.json() as Promise<{ models: Array<{ model: string; displayName: string; providerId: string; role: string | null }> }>;
}

async function deleteModel(name: string) {
  await SELF.fetch(`http://localhost/api/models/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { Authorization: AUTH },
  });
}

describe("POST /api/models/batch", () => {
  const PROVIDER = "tdd-provider";
  const MODELS = [
    { model: "model-a", displayName: "Model A", role: "daily" as const },
    { model: "model-b", displayName: "Model B", role: "complex" as const },
    { model: "model-c", displayName: "Model C", role: null },
    { model: "model-d", displayName: "Model D" },
  ];

  afterEach(async () => {
    for (const m of MODELS) {
      try { await deleteModel(m.displayName); } catch { /* ignore */ }
    }
  });

  // ── RED: batch import creates multiple models ───────────────────────

  it("creates multiple models with roles in one request", async () => {
    const res = await batchImport(
      MODELS.map((m) => ({ ...m, providerId: PROVIDER, displayName: m.displayName, role: m.role ?? undefined })),
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { ok: boolean; imported: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(4);
    expect(body.skipped).toBe(0);

    // Verify models exist with correct roles
    const list = await listModels();
    const names = list.models
      .filter((m) => m.providerId === PROVIDER)
      .map((m) => `${m.displayName}:${m.role ?? "null"}`)
      .sort();
    expect(names).toEqual([
      "Model A:daily",
      "Model B:complex",
      "Model C:null",
      "Model D:null",
    ]);
  });

  // ── RED: skip duplicates ─────────────────────────────────────────────

  it("skips models that already exist", async () => {
    // First import
    const first = await batchImport([
      { providerId: PROVIDER, model: "model-a", displayName: "Model A", role: "daily" },
    ]);
    expect((await first.json() as any).imported).toBe(1);

    // Second import with same model
    const second = await batchImport([
      { providerId: PROVIDER, model: "model-a", displayName: "Model A", role: "complex" },
      { providerId: PROVIDER, model: "model-b", displayName: "Model B", role: "daily" },
    ]);
    expect(second.status).toBe(200);

    const body = await second.json() as { ok: boolean; imported: number; skipped: number };
    expect(body.imported).toBe(1); // only model-b is new
    expect(body.skipped).toBe(1);  // model-a already exists
  });

  // ── RED: empty model list returns error ──────────────────────────────

  it("returns 400 for empty model list", async () => {
    const res = await batchImport([]);
    expect(res.status).toBe(400);
  });

  // ── RED: missing required fields returns error ───────────────────────

  it("returns 400 for models missing providerId", async () => {
    const res = await batchImport([
      { model: "x", displayName: "X", providerId: "" },
    ]);
    expect(res.status).toBe(400);
  });

  // ── RED: invalid role returns error ──────────────────────────────────

  it("returns 400 for invalid role value", async () => {
    const res = await batchImport([
      { providerId: PROVIDER, model: "x", displayName: "X", role: "invalid_role" as any },
    ]);
    expect(res.status).toBe(400);
  });

  // ── RED: valid roles are accepted ────────────────────────────────────

  it("accepts daily, complex, and extraction roles", async () => {
    const res = await batchImport([
      { providerId: PROVIDER, model: "role-test-1", displayName: "Role Test 1", role: "daily" },
      { providerId: PROVIDER, model: "role-test-2", displayName: "Role Test 2", role: "complex" },
      { providerId: PROVIDER, model: "role-test-3", displayName: "Role Test 3", role: "extraction" },
    ]);
    expect(res.status).toBe(200);

    const list = await listModels();
    const roles = list.models
      .filter((m) => m.providerId === PROVIDER && m.displayName.startsWith("Role Test"))
      .map((m) => `${m.displayName}:${m.role}`)
      .sort();
    expect(roles).toEqual([
      "Role Test 1:daily",
      "Role Test 2:complex",
      "Role Test 3:extraction",
    ]);
  });

  // ── RED: one model per role — importing a new one replaces the old ────

  it("replaces the old model when importing a new one with the same role", async () => {
    const first = await batchImport([
      { providerId: PROVIDER, model: "replace-a", displayName: "Replace A", role: "daily" },
    ]);
    expect((await first.json() as any).imported).toBe(1);

    const second = await batchImport([
      { providerId: PROVIDER, model: "replace-b", displayName: "Replace B", role: "daily" },
    ]);
    expect((await second.json() as any).imported).toBe(1);

    const list = await listModels();
    const a = list.models.find((m) => m.displayName === "Replace A");
    const b = list.models.find((m) => m.displayName === "Replace B");
    expect(a?.role).toBeNull();
    expect(b?.role).toBe("daily");
  });
});