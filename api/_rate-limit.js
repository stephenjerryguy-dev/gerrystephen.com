const buckets = globalThis.__gerryRateLimitBuckets || new Map();
globalThis.__gerryRateLimitBuckets = buckets;

function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const realIp = request.headers['x-real-ip'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded || realIp || request.socket?.remoteAddress || 'unknown';
  return String(value).split(',')[0].trim() || 'unknown';
}

function cleanup(now) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(request, response, options = {}) {
  const windowMs = options.windowMs || 60_000;
  const limit = options.limit || 60;
  const name = options.name || 'api';
  const now = Date.now();
  const key = `${name}:${clientIp(request)}`;
  cleanup(now);

  const current = buckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);
  response.setHeader('x-ratelimit-limit', String(limit));
  response.setHeader('x-ratelimit-remaining', String(remaining));
  response.setHeader('x-ratelimit-reset', String(resetSeconds));

  if (bucket.count <= limit) return false;

  response.setHeader('retry-after', String(resetSeconds));
  response.status(429).json({ error: 'rate limited', retryAfter: resetSeconds });
  return true;
}
