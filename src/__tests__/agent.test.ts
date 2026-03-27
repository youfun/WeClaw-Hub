import { describe, expect, it } from "vitest";
import { isDifficultQuery } from "../agent.ts";

describe("isDifficultQuery", () => {
  it("returns true for long messages", () => {
    expect(isDifficultQuery("a".repeat(301))).toBe(true);
  });

  it("returns true when query contains complex keywords", () => {
    expect(isDifficultQuery("请帮我分析这段代码的架构问题")).toBe(true);
  });

  it("returns true for multiple questions", () => {
    expect(isDifficultQuery("为什么会这样？应该怎么办？")).toBe(true);
  });

  it("returns false for simple smalltalk", () => {
    expect(isDifficultQuery("早上好，今天怎么样")).toBe(false);
  });
});