const hits = new Map<string, { count: number; resetAt: number }>();

function pruneExpired(now: number) {
  for (const [key, entry] of hits) {
    if (entry.resetAt < now) {
      hits.delete(key);
    }
  }
}

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/**
 * Client IP for rate limiting. Forwarded headers are only trusted when
 * TRUST_PROXY=true (same policy as middleware login throttling).
 */
export function clientIpFromRequest(request: Request): string {
  if (!envBool(process.env.TRUST_PROXY, false)) {
    return "direct";
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "direct"
  );
}

export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
): { ok: boolean; remaining: number } {
  const now = Date.now();
  pruneExpired(now);
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0 };
  }
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count };
}

/** Test helper — clears in-memory rate limit state. */
export function resetRateLimitStore() {
  hits.clear();
}
