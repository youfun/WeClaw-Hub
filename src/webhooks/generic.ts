function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shorten(text: string, limit = 500): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 3)}...`;
}

/**
 * Resolve `${path}` or `${expression}` placeholders against a JSON payload.
 *
 * Dot-notation paths like `${data.object.amount_total}` are resolved from the
 * payload. Arithmetic expressions like `${price * qty}` are evaluated after
 * resolving each variable path in the expression. Unresolvable values become
 * empty strings.
 */
export function resolveTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) return "";

    // Simple dot-path with no operators → direct lookup
    if (/^[\w.]+$/.test(trimmed)) {
      const val = getByPath(payload, trimmed);
      return val === undefined || val === null ? "" : String(val);
    }

    // Expression with operators → safe variable substitution
    return safeEvalExpr(trimmed, payload);
  });
}

/**
 * Evaluate an expression like `price * qty` or `data.object.amount_total / 100`
 * against a JSON payload. Dot-paths are resolved and replaced with safe
 * placeholder variable names before evaluation via `new Function`.
 */
function safeEvalExpr(expr: string, payload: Record<string, unknown>): string {
  // Collect all dot-paths (identifiers containing at least one dot)
  const dotPaths = new Map<string, { placeholder: string; value: unknown }>();
  const simpleKeys = new Set(Object.keys(payload));
  let counter = 0;

  let safe = expr;

  // Replace dot-paths with safe placeholders (longest first to avoid partial matches)
  const found = [...expr.matchAll(/\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)\b/g)]
    .map((m) => m[1]!)
    .sort((a, b) => b.length - a.length);
  for (const path of found) {
    if (dotPaths.has(path)) continue;
    const placeholder = `_p${counter++}`;
    dotPaths.set(path, { placeholder, value: getByPath(payload, path) ?? "" });
    // Replace all occurrences of this exact path
    safe = safe.split(path).join(placeholder);
  }

  // Replace simple identifiers that exist as payload keys (with placeholders if new)
  for (const name of simpleKeys) {
    if (dotPaths.has(name)) continue;
    const placeholder = `_p${counter++}`;
    dotPaths.set(name, { placeholder, value: payload[name] ?? "" });
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
    safe = safe.replace(re, placeholder);
  }

  const params = [...dotPaths.values()];
  try {
    const fn = new Function(...params.map((p) => p.placeholder), `return (${safe})`);
    const result = fn(...params.map((p) => p.value));
    if (result === undefined || result === null) return "";
    // Round floats to 2 decimal places to avoid 299.96999999999997
    if (typeof result === "number" && !Number.isInteger(result)) {
      return String(Math.round(result * 100) / 100);
    }
    return String(result);
  } catch {
    return "";
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walk a dot-notation path into a nested object. Returns `undefined` if any
 * intermediate step is null, undefined, or not an object (for non-leaf steps).
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Scan an expression string for identifier tokens that look like dot-paths
 * (contain at least one dot) and resolve them from the payload. Returns a
 * record mapping each path to its resolved value (or "" for missing).
 */
function collectPaths(
  expr: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const paths = new Set<string>();
  // Match identifiers that could be paths: word.word or word.word.word etc.
  for (const match of expr.matchAll(/\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+\b)/g)) {
    paths.add(match[1]!);
  }
  // Also collect simple (single-word) identifiers that exist in the payload
  for (const match of expr.matchAll(/\b([a-zA-Z_]\w*)\b/g)) {
    const name = match[1]!;
    if (!paths.has(name) && name in payload) {
      paths.add(name);
    }
  }
  const resolved: Record<string, unknown> = {};
  for (const path of paths) {
    // For simple names that exist directly on the payload, use them directly
    if (!path.includes(".") && path in payload) {
      resolved[path] = payload[path];
    } else {
      resolved[path] = getByPath(payload, path) ?? "";
    }
  }
  return resolved;
}

export function parseGenericMessage(
  source: string,
  payload: unknown,
  template?: string,
): string {
  const wrap = (text: string) => `[${source}] ${shorten(text)}`;

  // Template mode: resolve ${} placeholders from the JSON body
  if (template && typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const body = payload as Record<string, unknown>;
    const resolved = resolveTemplate(template, body);
    if (resolved) return wrap(resolved);
    // Template resolved to empty — fall through to generic extraction
  }

  if (typeof payload === "string") {
    return wrap(payload);
  }

  const body = asRecord(payload);
  if (!body) return wrap(JSON.stringify(payload));

  const text = asText(body.text) || asText(body.message) || asText(body.content);
  if (text) {
    return wrap(text);
  }

  return wrap(JSON.stringify(body));
}
