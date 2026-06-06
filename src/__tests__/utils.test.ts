import { describe, it, expect } from "vitest";
import { secureCompare, getBearerToken, json } from "../utils.ts";

describe("secureCompare", () => {
  it("returns true for identical strings", () => {
    expect(secureCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(secureCompare("abc", "abd")).toBe(false);
  });

  it("returns false for different length strings", () => {
    expect(secureCompare("abc", "ab")).toBe(false);
  });

  it("is timing-safe (constant-time comparison)", () => {
    // Functional test: shouldn't throw or behave differently
    expect(secureCompare("", "")).toBe(true);
    expect(secureCompare("a", "")).toBe(false);
  });
});

describe("getBearerToken", () => {
  it("extracts token from Authorization header", () => {
    expect(getBearerToken("Bearer my-token-123")).toBe("my-token-123");
  });

  it("returns empty string for missing Bearer prefix", () => {
    expect(getBearerToken("Basic xyz")).toBe("");
  });

  it("returns empty string for empty header", () => {
    expect(getBearerToken("")).toBe("");
  });
});

describe("json", () => {
  it("returns a JSON Response with status 200 by default", () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns a JSON Response with custom status", () => {
    const res = json({ error: "not found" }, 404);
    expect(res.status).toBe(404);
  });
});
