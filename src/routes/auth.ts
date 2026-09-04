import { Hono } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import { one, run } from '../lib/db'
import { hashPassword, verifyPassword, uuid } from '../lib/crypto'
import { createSession, destroySession, requireAuthApi } from '../lib/auth'
import { readBody, str, email as vEmail, ValidationError } from '../lib/validation'
import { rateLimit } from '../middleware/rate-limit'

const auth = new Hono<AppEnv>()

// Brute-force protection on credential endpoints (per IP, per minute).
auth.use('/login', rateLimit({ limit: 10, windowMs: 60_000 }))
auth.use('/register', rateLimit({ limit: 5, windowMs: 60_000 }))

auth.post('/register', async (c) => {
  const body = await readBody(c.req.raw)
  const email = vEmail(body.email)
  const name = str(body.name, 'name', { min: 2, max: 80 })
  const company = str(body.company, 'company', { max: 120, optional: true }) || null
  const password = str(body.password, 'password', { min: 8, max: 128 })

  const exists = await one<{ id: string }>(c.env.DB, 'SELECT id FROM users WHERE email = ?', email)
  if (exists) throw new ValidationError('email', 'An account with this email already exists')

  const id = uuid()
  const password_hash = await hashPassword(password)
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users (id, email, password_hash, name, company) VALUES (?, ?, ?, ?, ?)').bind(id, email, password_hash, name, company),
    c.env.DB.prepare('INSERT INTO user_settings (user_id) VALUES (?)').bind(id)
  ])
  await createSession(c, id)
  const user = await one<AuthUser>(c.env.DB, 'SELECT id, email, name, company, avatar_url, created_at FROM users WHERE id = ?', id)
  return c.json({ user }, 201)
})

auth.post('/login', async (c) => {
  const body = await readBody(c.req.raw)
  const email = vEmail(body.email)
  const password = str(body.password, 'password', { min: 1, max: 128 })

  const row = await one<AuthUser & { password_hash: string }>(
    c.env.DB,
    'SELECT id, email, name, company, avatar_url, created_at, password_hash FROM users WHERE email = ?',
    email
  )
  // Constant-ish time: always verify against something.
  const ok = row ? await verifyPassword(password, row.password_hash) : (await verifyPassword(password, 'pbkdf2$1$AAAA$AAAA'), false)
  if (!row || !ok) return c.json({ error: 'Invalid email or password' }, 401)

  await createSession(c, row.id)
  const { password_hash: _ph, ...user } = row
  return c.json({ user })
})

auth.post('/logout', async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

auth.get('/me', requireAuthApi, async (c) => {
  const settings = await one(c.env.DB, 'SELECT * FROM user_settings WHERE user_id = ?', c.var.user!.id)
  return c.json({ user: c.var.user, settings })
})

auth.post('/change-password', requireAuthApi, async (c) => {
  const body = await readBody(c.req.raw)
  const current = str(body.current_password, 'current_password', { min: 1 })
  const next = str(body.new_password, 'new_password', { min: 8, max: 128 })
  const row = await one<{ password_hash: string }>(c.env.DB, 'SELECT password_hash FROM users WHERE id = ?', c.var.user!.id)
  if (!row || !(await verifyPassword(current, row.password_hash))) return c.json({ error: 'Current password is incorrect' }, 400)
  await run(c.env.DB, 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', await hashPassword(next), c.var.user!.id)
  // Revoke all other sessions
  await run(c.env.DB, 'DELETE FROM sessions WHERE user_id = ? AND id != ?', c.var.user!.id, c.var.sessionId)
  return c.json({ ok: true })
})

export default auth
