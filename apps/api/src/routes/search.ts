import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";
import { searchSkills } from "../lib/search";

const searchBodySchema = z.object({
  query: z.string().min(1, "query is required").max(500, "query must be 500 characters or less"),
  limit: z.number().int().min(1).max(5).optional().default(5),
});

export const searchRoute = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

searchRoute.use("/search", authMiddleware, rateLimitMiddleware);

searchRoute.post("/search", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON in request body" }, 400);
  }

  const parseResult = searchBodySchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error: parseResult.error.issues[0]?.message ?? "Invalid request" }, 400);
  }

  const query = parseResult.data.query.trim();
  if (!query) {
    return c.json({ error: "query is required" }, 400);
  }

  const limit = parseResult.data.limit;

  const db = c.var.db;
  const userId = c.var.userId;

  // Search
  const results = await searchSkills(db, c.env.OPENAI_API_KEY, query, limit, c.env.CACHE, c.executionCtx);

  // Record usage
  await db.searchUsage.create({
    data: { userId, query },
  });

  // Write per-result analytics (non-blocking)
  c.executionCtx.waitUntil((async () => {
    try {
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        c.env.TELEMETRY.writeDataPoint({
          indexes: ["search_result"],
          blobs: [query, r.skillId, r.slug, r.name, r.githubUrl],
          doubles: [r.score, i + 1, results.length],
        });
      }
    } catch (err) {
      console.error(JSON.stringify({ message: "search_result_telemetry_failed", error: err instanceof Error ? err.message : String(err) }));
    }
  })());

  return c.json({
    results,
    meta: {
      query,
      total: results.length,
      limit,
      remainingSearches: c.var.remainingSearches,
    },
  });
});
