import { parseGenericMessage } from "./generic.ts";
import { parseGitHubMessage } from "./github.ts";
import { parseTapdMessage } from "./tapd.ts";

function normalizeSourceName(source: string): string {
  if (!source) return "Webhook";
  return source
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function parseWebhookMessage(
  source: string,
  payload: unknown,
  headers: Headers,
): string | null {
  const normalized = source.toLowerCase();



  if (normalized === "github") {
    return parseGitHubMessage(payload, headers);
  }

  if (normalized === "tapd") {
    return parseTapdMessage(payload);
  }

  return parseGenericMessage(normalizeSourceName(source), payload);
}