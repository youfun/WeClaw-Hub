// Deploy service types & session management
export interface DeploySession {
  sessionId: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: number;
  expiresAt: number;
  accessToken?: string;
  cloudflareAccountId?: string;
}

export interface DeployConfig {
  accountId: string;
  workerName: string;
  authToken: string;
  llm?: {
    provider: "anthropic" | "openai-compat";
    apiKey: string;
    baseUrl?: string;
    model?: string;
  };
  route?: string | null;
}

export interface DeployResult {
  ok: boolean;
  workerUrl: string;
  adminUrl: string;
  created: {
    kvNamespaces: string[];
    worker: string;
  };
  error?: string;
}

export interface CloudflareAccount {
  id: string;
  name: string;
}

export interface CloudflareKVNamespace {
  id: string;
  title: string;
}

// ---- Session storage ----
// In-memory for MVP; replace with KV for production
// Sessions are keyed by state (OAuth parameter) and also accessible by sessionId
const sessionsByState = new Map<string, DeploySession>();
const stateBySessionId = new Map<string, string>();

export function getSession(sessionId: string): DeploySession | undefined {
  const state = stateBySessionId.get(sessionId);
  if (!state) return undefined;
  return sessionsByState.get(state);
}

export function findSessionByState(state: string): DeploySession | undefined {
  return sessionsByState.get(state);
}

export function setSession(sessionId: string, state: string, session: DeploySession): void {
  sessionsByState.set(state, session);
  stateBySessionId.set(sessionId, state);
}

export function deleteSession(sessionId: string): void {
  const state = stateBySessionId.get(sessionId);
  if (state) sessionsByState.delete(state);
  stateBySessionId.delete(sessionId);
}

export function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [state, s] of sessionsByState) {
    if (now > s.expiresAt) {
      sessionsByState.delete(state);
      stateBySessionId.delete(s.sessionId);
    }
  }
}

// ---- Session creation ----
export async function createSession(): Promise<DeploySession> {
  const sessionId = crypto.randomUUID();
  const state = crypto.randomUUID();
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const session: DeploySession = {
    sessionId,
    state,
    codeVerifier,
    codeChallenge,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  cleanExpiredSessions();
  setSession(sessionId, state, session);
  return session;
}

// ---- PKCE helpers ----
export function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}