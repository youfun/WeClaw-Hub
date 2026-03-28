import { Hono } from "hono";
import type { Env } from "../env.ts";
import { BUILTIN_TOOLS } from "../tools.ts";

export const toolRoutes = new Hono<{ Bindings: Env }>();

toolRoutes.get("/api/tools", async (c) => {
  return c.json({ tools: BUILTIN_TOOLS });
});