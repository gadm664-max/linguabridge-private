/**
 * Lightweight per-isolate rate limiter (fixed window). Workers isolates are ephemeral, so this is a
 * best-effort brute-force brake — not a global quota. A D1/Durable-Object backed limiter can replace
 * it later without touching route code.
 */
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../types'

interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()

export function rateLimit(opts: { limit: number; windowMs: number; keyPrefix?: string }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local'
    const key = `${opts.keyPrefix ?? c.req.path}:${ip}`
    const now = Date.now()
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, b)
    }
    b.count++
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
    }
    c.header('X-RateLimit-Limit', String(opts.limit))
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.limit - b.count)))
    if (b.count > opts.limit) {
      c.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)))
      return c.json({ error: 'Too many requests. Please try again shortly.' }, 429)
    }
    await next()
  }
}
