/**
 * Bun SQLite adapter — implements ISqlStorage and IBotStorage
 * using Bun's built-in SQLite (bun:sqlite).
 *
 * Matches the Cloudflare Durable Object SQLite API surface
 * that BotSession depends on:
 *   - storage.sql.exec(query, ...params).toArray()
 *   - storage.setAlarm / getAlarm / deleteAlarm
 *   - storage.transactionSync
 *   - (waitUntil is on IBotState, not storage)
 */

import type { Database } from "bun:sqlite";
import type { ISqlStorage, ISqlResult, IBotStorage } from "../../adapter-interfaces";

// ── Helpers ────────────────────────────────────────────────────────────────

function isReadQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return (
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("WITH") ||
    trimmed.startsWith("PRAGMA") ||
    trimmed.startsWith("EXPLAIN")
  );
}

// ── SqlStorage ─────────────────────────────────────────────────────────────

function createSqlStorage(db: Database): ISqlStorage {
  return {
    exec(query: string, ...params: unknown[]): ISqlResult {
      if (isReadQuery(query)) {
        const stmt = db.query(query);
        // bun:sqlite .all() accepts variadic positional params
        const rows = params.length > 0
          ? stmt.all(...params as Parameters<typeof stmt.all>)
          : stmt.all();
        return { toArray: () => rows as Record<string, unknown>[] };
      }
      // Mutations: run and return empty
      db.run(query, ...params as Parameters<typeof db.run>);
      return { toArray: () => [] };
    },
  };
}

// ── BotStorage ─────────────────────────────────────────────────────────────

export interface AlarmCallback {
  (): Promise<void>;
}

export function createBotStorage(
  db: Database,
  alarmCallback?: AlarmCallback,
): IBotStorage {
  const sqlStorage = createSqlStorage(db);
  let alarmTime: number | null = null;
  let alarmTimer: Timer | undefined;

  return {
    sql: sqlStorage,

    async setAlarm(scheduledTime: number): Promise<void> {
      alarmTime = scheduledTime;
      if (alarmTimer) clearTimeout(alarmTimer);
      const delay = scheduledTime - Date.now();
      if (delay > 0 && alarmCallback) {
        alarmTimer = setTimeout(async () => {
          alarmTime = null;
          await alarmCallback();
        }, Math.max(delay, 0));
      }
    },

    async getAlarm(): Promise<number | null> {
      return alarmTime;
    },

    async deleteAlarm(): Promise<void> {
      alarmTime = null;
      if (alarmTimer) {
        clearTimeout(alarmTimer);
        alarmTimer = undefined;
      }
    },

    transactionSync<T>(callback: () => T): T {
      // bun:sqlite db.transaction(fn) returns a function; call it immediately
      const txFn = db.transaction(callback);
      return (txFn as () => T)();
    },
  };
}

// ── BotState (IBotState) ───────────────────────────────────────────────────

import type { IBotState } from "../../adapter-interfaces";

export function createBotState(
  db: Database,
  alarmCallback?: AlarmCallback,
): IBotState {
  const storage = createBotStorage(db, alarmCallback);
  return {
    storage,
    waitUntil(promise: Promise<void>): void {
      promise.catch((err) =>
        console.error("[waitUntil] background task failed:", err),
      );
    },
  };
}