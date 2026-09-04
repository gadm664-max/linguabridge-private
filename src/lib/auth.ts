/**
 * Session-based authentication.
 * - Cookie holds a random 256-bit token; DB stores its SHA-256 hash (a DB leak can't hijack sessions).
 * - Sessions expire after 30 days and are revocable server-side.
 */
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, AuthUser } from '../types'
import { one, run, isoIn } from './db'
import { randomToken, sha256Hex } from './crypto'
import { isSecureRequest } from './url'

export const SESSION_COOKIE = 'lb_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const raw = randomToken(32)
  const id = await sha256Hex(raw + c.env.SESSION_SECRET)
  await run(
    c.env.DB,
    'INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)',
    id,
    userId,
    isoIn(SESSION_TTL_MS),
    c.req.header('user-agent') ?? null
  )
  const secure = isSecureRequest(c.req.raw)
  setCookie(c, SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000
  })
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const raw = getCookie(c, SESSION_COOKIE)
  if (raw) {
    const id = await sha256Hex(raw + c.env.SESSION_SECRET)
    await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id)
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/** Loads the current user (if any) into c.var.user. Never throws. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null)
  c.set('sessionId', null)
  const raw = getCookie(c, SESSION_COOKIE)
  if (raw && c.env.SESSION_SECRET) {
    try {
      const id = await sha256Hex(raw + c.env.SESSION_SECRET)
      const user = await one<AuthUser>(
        c.env.DB,
        `SELECT u.id, u.email, u.name, u.company, u.avatar_url, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP`,
        id
      )
      if (user) {
        c.set('user', user)
        c.set('sessionId', id)
      }
    } catch {
      /* treat as anonymous */
    }
  }
  await next()
}

/** API guard: 401 JSON when not logged in. */
export const requireAuthApi: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ error: 'Authentication required' }, 401)
  await next()
}

/** Page guard: redirect to /login when not logged in. */
export const requireAuthPage: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) {
    const next_ = encodeURIComponent(new URL(c.req.url).pathname)
    return c.redirect(`/login?next=${next_}`)
  }
  await next()
}
