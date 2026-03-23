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

export function parseGitHubMessage(payload: unknown, headers: Headers): string | null {
  const body = asRecord(payload);
  if (!body) return null;

  const event = (headers.get("X-GitHub-Event") || asText(body.event) || "event").trim();
  const repo = asText(asRecord(body.repository)?.full_name) || "unknown-repo";

  if (event === "push") {
    const ref = asText(body.ref).split("/").pop() || asText(body.ref) || "unknown-ref";
    const headCommit = asRecord(body.head_commit);
    const message = shorten(asText(headCommit?.message) || "new commits");
    const commits = Array.isArray(body.commits) ? body.commits.length : 0;
    return `[GitHub] ${repo} push: ${ref} (${commits} commit${commits === 1 ? "" : "s"}) ${message}`;
  }

  if (event === "pull_request") {
    const pullRequest = asRecord(body.pull_request);
    const action = asText(body.action) || "updated";
    const number = Number(pullRequest?.number ?? body.number);
    const title = shorten(asText(pullRequest?.title) || "pull request");
    return `[GitHub] ${repo} pull_request: ${action} #${Number.isFinite(number) ? number : "?"} ${title}`;
  }

  if (event === "issues") {
    const issue = asRecord(body.issue);
    const action = asText(body.action) || "updated";
    const number = Number(issue?.number ?? body.number);
    const title = shorten(asText(issue?.title) || "issue");
    return `[GitHub] ${repo} issues: ${action} #${Number.isFinite(number) ? number : "?"} ${title}`;
  }

  if (event === "ping") {
    return `[GitHub] ${repo} ping: webhook configured`;
  }

  const action = asText(body.action);
  return `[GitHub] ${repo} ${event}: ${shorten(action || "received")}`;
}