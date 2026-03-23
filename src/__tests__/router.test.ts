import { describe, it, expect } from "vitest";
import { parseRoute } from "../router.ts";

describe("parseRoute", () => {
  it("returns help for /help", () => {
    expect(parseRoute("/help")).toEqual({ type: "help" });
  });

  it("returns help for /HELP (case insensitive)", () => {
    expect(parseRoute("/HELP")).toEqual({ type: "help" });
  });

  it("returns status for /status", () => {
    expect(parseRoute("/status")).toEqual({ type: "status" });
  });

  it("returns clear for /clear", () => {
    expect(parseRoute("/clear")).toEqual({ type: "clear" });
  });

  it("returns model with empty args for /model alone", () => {
    expect(parseRoute("/model")).toEqual({ type: "model", args: "" });
  });

  it("returns model with args for /model list", () => {
    expect(parseRoute("/model list")).toEqual({ type: "model", args: "list" });
  });

  it("returns model with args for /model <id>", () => {
    expect(parseRoute("/model claude-3-5-sonnet")).toEqual({
      type: "model",
      args: "claude-3-5-sonnet",
    });
  });

  it("returns agent with message for /claude <msg>", () => {
    expect(parseRoute("/claude hello world")).toEqual({
      type: "agent",
      message: "hello world",
    });
  });

  it("returns agent with empty message for /claude alone", () => {
    expect(parseRoute("/claude")).toEqual({ type: "agent", message: "" });
  });

  it("routes plain text to agent", () => {
    expect(parseRoute("Hello there")).toEqual({
      type: "agent",
      message: "Hello there",
    });
  });

  it("routes unrecognized command to agent", () => {
    expect(parseRoute("/unknown")).toEqual({
      type: "agent",
      message: "/unknown",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseRoute("  /help  ")).toEqual({ type: "help" });
  });

  it("trims /claude message whitespace", () => {
    expect(parseRoute("/claude   hi  ")).toEqual({
      type: "agent",
      message: "hi",
    });
  });
});
