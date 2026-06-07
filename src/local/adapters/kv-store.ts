/**
 * Local KV Store adapter — implements IKvStore using a SQLite table.
 *
 * Each "namespace" gets its own table (e.g. kv_backends, kv_contacts),
 * mimicking Cloudflare KV Namespaces.
 *
 * Supported operations:
 *   - get(key, type?)  → string | object | null
 *   - put(key, value)  → Promise<void>
 *   - delete(key)      → Promise<void>
 *   - list({ prefix }) → Promise<{ keys: Array<{ name: string }> }>
 */

import type { Database } from "bun:sqlite";
import type { IKvStore } from "../../adapter-interfaces";

function tableName(ns: string): string {
  // Sanitize namespace to a valid SQLite table name
  return `kv_${ns.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function createKvStore(db: Database, namespace: string): IKvStore {
  const table = tableName(namespace);

  // Ensure the table exists
  db.run(
    `CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );

  return {
    async get(
      key: string,
      type?: "text" | "json",
    ): Promise<string | object | null> {
      const row = db
        .query(`SELECT value FROM ${table} WHERE key = ?`)
        .get(key) as { value: string } | null;
      if (!row) return null;
      if (type === "json") {
        try {
          return JSON.parse(row.value) as object;
        } catch {
          return null;
        }
      }
      return row.value;
    },

    async put(key: string, value: string): Promise<void> {
      db.run(
        `INSERT OR REPLACE INTO ${table} (key, value) VALUES (?, ?)`,
        [key, value],
      );
    },

    async delete(key: string): Promise<void> {
      db.run(`DELETE FROM ${table} WHERE key = ?`, [key]);
    },

    async list(options?: {
      prefix?: string;
    }): Promise<{ keys: Array<{ name: string }> }> {
      if (options?.prefix) {
        const rows = db
          .query(`SELECT key FROM ${table} WHERE key LIKE ?`)
          .all(`${options.prefix}%`) as Array<{ key: string }>;
        return { keys: rows.map((r) => ({ name: r.key })) };
      }
      const rows = db
        .query(`SELECT key FROM ${table}`)
        .all() as Array<{ key: string }>;
      return { keys: rows.map((r) => ({ name: r.key })) };
    },
  };
}