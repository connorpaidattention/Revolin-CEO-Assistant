/**
 * Simple in-memory rate limiter.
 * Tracks request timestamps per key using a sliding window.
 */

const store = new Map<string, number[]>();

const MAX_REQUESTS = 30; // per window
const WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Get or create timestamps array
  let timestamps = store.get(key) ?? [];

  // Prune old entries
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length === 0) {
    store.delete(key);
    return { allowed: true, remaining: MAX_REQUESTS, resetMs: WINDOW_MS };
  }

  if (timestamps.length >= MAX_REQUESTS) {
    const oldestInWindow = timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + WINDOW_MS - now,
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - timestamps.length,
    resetMs: WINDOW_MS,
  };
}
