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

export function parseGenericMessage(source: string, payload: unknown): string {
  if (typeof payload === "string") {
    return `[${source}] ${shorten(payload)}`;
  }

  const body = asRecord(payload);
  if (!body) return `[${source}] ${shorten(JSON.stringify(payload))}`;

  const text = asText(body.text) || asText(body.message) || asText(body.content);
  if (text) {
    return `[${source}] ${shorten(text)}`;
  }

  return `[${source}] ${shorten(JSON.stringify(body))}`;
}