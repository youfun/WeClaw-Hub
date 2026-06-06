/**
 * Shared utility functions used across the project.
 */

/** Timing-safe string comparison for auth tokens. */
export function secureCompare(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

/** Extract Bearer token from Authorization header value. */
export function getBearerToken(auth: string): string {
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7);
}

/** Return a JSON Response with the given data and status code. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
