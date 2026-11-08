/**
 * In-memory sliding-window rate limiter for sensitive operations.
 * Protects login endpoints from brute-force attacks and storage from upload abuse.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStale(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, record] of store.entries()) {
    // Keep entries if any timestamp is within 1 hour
    const active = record.timestamps.filter((ts) => now - ts < 3600 * 1000);
    if (active.length === 0) {
      store.delete(key);
    } else {
      record.timestamps = active;
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
};

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
  nowMs: number = Date.now()
): RateLimitResult {
  cleanupStale(nowMs);
  const windowMs = windowSeconds * 1000;
  const threshold = nowMs - windowMs;

  let record = store.get(key);
  if (!record) {
    record = { timestamps: [] };
    store.set(key, record);
  }

  // Filter timestamps within window
  record.timestamps = record.timestamps.filter((ts) => ts > threshold);

  if (record.timestamps.length >= maxAttempts) {
    const oldestInWindow = record.timestamps[0] ?? threshold;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - nowMs) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      resetAt: new Date(oldestInWindow + windowMs),
    };
  }

  record.timestamps.push(nowMs);
  return {
    allowed: true,
    remaining: maxAttempts - record.timestamps.length,
    retryAfterSeconds: 0,
    resetAt: new Date(nowMs + windowMs),
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Login rate limit: 5 attempts per 15 minutes per IP or email.
 */
export function checkLoginRateLimit(identifier: string, nowMs: number = Date.now()): RateLimitResult {
  const key = `login:${identifier.trim().toLowerCase()}`;
  return checkRateLimit(key, 5, 15 * 60, nowMs);
}

/**
 * Upload rate limit: 30 uploads per minute per actor.
 */
export function checkUploadRateLimit(actorId: string, nowMs: number = Date.now()): RateLimitResult {
  const key = `upload:${actorId.trim().toLowerCase()}`;
  return checkRateLimit(key, 30, 60, nowMs);
}
