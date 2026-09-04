/**
 * Public origin & TLS detection for links and cookies.
 * Order: APP_BASE_URL → X-Forwarded-Proto / CF-Visitor (proxies) → request URL,
 * with the rule that any non-local hostname is treated as HTTPS (production is always TLS;
 * some dev proxies terminate TLS without forwarding the scheme).
 */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/

function forwardedProto(req: Request): 'http' | 'https' | null {
  const xf = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  if (xf === 'https' || xf === 'http') return xf
  const cfv = req.headers.get('cf-visitor')
  if (cfv) {
    try { const s = JSON.parse(cfv).scheme; if (s === 'https' || s === 'http') return s } catch { /* ignore */ }
  }
  return null
}

export function isSecureRequest(req: Request): boolean {
  const fp = forwardedProto(req)
  if (fp) return fp === 'https'
  const u = new URL(req.url)
  if (u.protocol === 'https:') return true
  return !LOCAL_HOST.test(u.hostname)
}

export function publicOrigin(env: { APP_BASE_URL?: string }, req: Request): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, '')
  const u = new URL(req.url)
  u.protocol = isSecureRequest(req) ? 'https:' : 'http:'
  return u.origin
}
