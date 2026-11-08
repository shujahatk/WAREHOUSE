import { createHmac, timingSafeEqual } from "node:crypto";

export function signedFileUrl(secret: string, key: string, now: string, ttlSeconds = 300): { url: string; expiresAt: string } {
  const expiresMs = Date.parse(now) + ttlSeconds * 1000;
  const sig = createHmac("sha256", secret).update(`${key}.${expiresMs}`).digest("hex");
  return { url: `/api/files/${encodeURIComponent(key)}?exp=${expiresMs}&sig=${sig}`, expiresAt: new Date(expiresMs).toISOString() };
}

export function fileSignatureMatches(secret: string, key: string, exp: string, sig: string, nowMs: number): boolean {
  const expiresMs = Number(exp);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs || !sig) return false;
  const expected = createHmac("sha256", secret).update(`${key}.${expiresMs}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
