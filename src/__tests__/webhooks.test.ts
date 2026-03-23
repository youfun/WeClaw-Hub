import { describe, it, expect } from "vitest";
import { parseGitHubMessage } from "../webhooks/github.ts";
import { parseGenericMessage } from "../webhooks/generic.ts";
import { parseWebhookMessage } from "../webhooks/index.ts";

// ── GitHub parser ──────────────────────────────────────────────────────────

describe("parseGitHubMessage", () => {
  function h(event: string): Headers {
    return new Headers({ "X-GitHub-Event": event });
  }

  it("returns null for non-object payload", () => {
    expect(parseGitHubMessage("not an object", h("push"))).toBeNull();
  });

  it("formats push event", () => {
    const payload = {
      ref: "refs/heads/main",
      repository: { full_name: "acme/repo" },
      commits: [1, 2],
      head_commit: { message: "fix: typo" },
    };
    const msg = parseGitHubMessage(payload, h("push"));
    expect(msg).toBe("[GitHub] acme/repo push: main (2 commits) fix: typo");
  });

  it("formats push with singular commit", () => {
    const payload = {
      ref: "refs/heads/dev",
      repository: { full_name: "acme/repo" },
      commits: [1],
      head_commit: { message: "chore: update deps" },
    };
    const msg = parseGitHubMessage(payload, h("push"));
    expect(msg).toContain("(1 commit)");
  });

  it("formats pull_request event", () => {
    const payload = {
      action: "opened",
      repository: { full_name: "acme/repo" },
      pull_request: { number: 42, title: "Add feature X" },
    };
    const msg = parseGitHubMessage(payload, h("pull_request"));
    expect(msg).toBe("[GitHub] acme/repo pull_request: opened #42 Add feature X");
  });

  it("formats issues event", () => {
    const payload = {
      action: "closed",
      repository: { full_name: "acme/repo" },
      issue: { number: 7, title: "Bug in login" },
    };
    const msg = parseGitHubMessage(payload, h("issues"));
    expect(msg).toBe("[GitHub] acme/repo issues: closed #7 Bug in login");
  });

  it("formats ping event", () => {
    const payload = { repository: { full_name: "acme/repo" } };
    const msg = parseGitHubMessage(payload, h("ping"));
    expect(msg).toBe("[GitHub] acme/repo ping: webhook configured");
  });

  it("falls back to event body field when no header", () => {
    const payload = {
      event: "ping",
      repository: { full_name: "acme/repo" },
    };
    const msg = parseGitHubMessage(payload, new Headers());
    expect(msg).toContain("ping");
  });

  it("truncates long commit message", () => {
    const longMsg = "x".repeat(600);
    const payload = {
      ref: "refs/heads/main",
      repository: { full_name: "a/b" },
      commits: [],
      head_commit: { message: longMsg },
    };
    const msg = parseGitHubMessage(payload, h("push"))!;
    expect(msg.length).toBeLessThan(700);
    expect(msg).toContain("...");
  });

  it("uses event header over body field", () => {
    const payload = {
      event: "issues",
      repository: { full_name: "acme/repo" },
    };
    const msg = parseGitHubMessage(payload, h("ping"));
    expect(msg).toContain("ping");
  });
});

// ── Generic parser ─────────────────────────────────────────────────────────

describe("parseGenericMessage", () => {
  it("wraps plain string payload", () => {
    expect(parseGenericMessage("MyApp", "hello")).toBe("[MyApp] hello");
  });

  it("extracts text field from object", () => {
    expect(parseGenericMessage("App", { text: "hi there" })).toBe("[App] hi there");
  });

  it("extracts message field when no text", () => {
    expect(parseGenericMessage("App", { message: "msg value" })).toBe("[App] msg value");
  });

  it("extracts content field when no text/message", () => {
    expect(parseGenericMessage("App", { content: "content val" })).toBe("[App] content val");
  });

  it("falls back to JSON stringify for objects without known fields", () => {
    const msg = parseGenericMessage("App", { foo: "bar" });
    expect(msg).toContain("[App]");
    expect(msg).toContain("foo");
  });

  it("handles null payload", () => {
    const msg = parseGenericMessage("App", null);
    expect(msg).toContain("[App]");
  });

  it("truncates long text", () => {
    const long = "a".repeat(600);
    const msg = parseGenericMessage("App", long);
    expect(msg.length).toBeLessThan(600);
    expect(msg).toContain("...");
  });
});

// ── Webhook index dispatcher ───────────────────────────────────────────────

describe("parseWebhookMessage", () => {
  it("dispatches github source to GitHub parser", () => {
    const payload = {
      repository: { full_name: "a/b" },
    };
    const msg = parseWebhookMessage("github", payload, new Headers({ "X-GitHub-Event": "ping" }));
    expect(msg).toBe("[GitHub] a/b ping: webhook configured");
  });

  it("dispatches unknown source to generic parser", () => {
    const msg = parseWebhookMessage("myservice", { text: "hello" }, new Headers());
    expect(msg).toBe("[Myservice] hello");
  });

  it("normalizes multi-word source names", () => {
    const msg = parseWebhookMessage("my-service", { text: "hi" }, new Headers());
    expect(msg).toBe("[My Service] hi");
  });

  it("handles empty source as Webhook label", () => {
    const msg = parseWebhookMessage("", { text: "hi" }, new Headers());
    expect(msg).toBe("[Webhook] hi");
  });
});
