const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
  locked: boolean;
}

const store = new Map<string, Bucket>();
let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart > WINDOW_MS) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = WINDOW_MS,
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { count: 0, windowStart: now, locked: false };
    store.set(key, bucket);
  }

  if (bucket.locked) {
    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetAt = bucket.windowStart + windowMs;
    return {
      allowed: false,
      remaining,
      resetAt,
    };
  }

  bucket.locked = true;
  bucket.count += 1;
  const remaining = Math.max(0, maxRequests - bucket.count);
  const resetAt = bucket.windowStart + windowMs;
  bucket.locked = false;

  return {
    allowed: bucket.count <= maxRequests,
    remaining,
    resetAt,
  };
}

export function rateLimitHeaders(
  key: string,
  maxRequests: number,
  windowMs?: number,
): Record<string, string> {
  const result = checkRateLimit(key, maxRequests, windowMs);
  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}
