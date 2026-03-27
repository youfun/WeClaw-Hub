import { describe, expect, it } from "vitest";
import { computeNextRun } from "../scheduler.ts";

describe("computeNextRun", () => {
  it("computes the next interval run", () => {
    const from = Date.UTC(2026, 2, 27, 12, 0, 0);
    expect(computeNextRun({ type: "interval", interval_ms: 60_000 }, from)).toBe(from + 60_000);
  });

  it("computes the next daily cron run in UTC", () => {
    const from = Date.UTC(2026, 2, 27, 12, 34, 56);
    const next = computeNextRun({ type: "cron", cron: "0 21 * * *" }, from);
    expect(new Date(next).toISOString()).toBe("2026-03-27T21:00:00.000Z");
  });

  it("rolls cron schedule to the next day when already past the target hour", () => {
    const from = Date.UTC(2026, 2, 27, 22, 0, 0);
    const next = computeNextRun({ type: "cron", cron: "0 21 * * *" }, from);
    expect(new Date(next).toISOString()).toBe("2026-03-28T21:00:00.000Z");
  });

  it("supports stepped cron expressions", () => {
    const from = Date.UTC(2026, 2, 27, 10, 7, 0);
    const next = computeNextRun({ type: "cron", cron: "*/15 * * * *" }, from);
    expect(new Date(next).toISOString()).toBe("2026-03-27T10:15:00.000Z");
  });
});
