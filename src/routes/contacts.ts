import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuthApi } from '../lib/auth'
import { one, many, run } from '../lib/db'
import { uuid } from '../lib/crypto'
import { readBody, str, country, language } from '../lib/validation'

const contacts = new Hono<AppEnv>()
contacts.use('*', requireAuthApi)

contacts.get('/', async (c) => {
  const q = (c.req.query('q') || '').trim()
  const rows = q
    ? await many(c.env.DB, 'SELECT * FROM contacts WHERE owner_user_id = ? AND (name LIKE ? OR email LIKE ? OR company LIKE ?) ORDER BY name LIMIT 200', c.var.user!.id, `%${q}%`, `%${q}%`, `%${q}%`)
    : await many(c.env.DB, 'SELECT * FROM contacts WHERE owner_user_id = ? ORDER BY name LIMIT 200', c.var.user!.id)
  return c.json({ contacts: rows })
})

function parse(body: Record<string, unknown>) {
  return {
    name: str(body.name, 'name', { min: 1, max: 120 }),
    email: body.email ? str(body.email, 'email', { max: 254 }).toLowerCase() : null,
    company: str(body.company, 'company', { max: 120, optional: true }) || null,
    country_code: country(body.country_code),
    spoken_language: body.spoken_language ? language(body.spoken_language, 'spoken_language') : null,
    translation_language: body.translation_language ? language(body.translation_language, 'translation_language') : null,
    notes: str(body.notes, 'notes', { max: 2000, optional: true }) || null
  }
}

contacts.post('/', async (c) => {
  const d = parse(await readBody(c.req.raw))
  const id = uuid()
  await run(
    c.env.DB,
    'INSERT INTO contacts (id, owner_user_id, name, email, company, country_code, spoken_language, translation_language, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, c.var.user!.id, d.name, d.email, d.company, d.country_code, d.spoken_language, d.translation_language, d.notes
  )
  return c.json({ contact: await one(c.env.DB, 'SELECT * FROM contacts WHERE id = ?', id) }, 201)
})

contacts.put('/:id', async (c) => {
  const existing = await one<{ id: string }>(c.env.DB, 'SELECT id FROM contacts WHERE id = ? AND owner_user_id = ?', c.req.param('id'), c.var.user!.id)
  if (!existing) return c.json({ error: 'Contact not found' }, 404)
  const d = parse(await readBody(c.req.raw))
  await run(
    c.env.DB,
    'UPDATE contacts SET name = ?, email = ?, company = ?, country_code = ?, spoken_language = ?, translation_language = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    d.name, d.email, d.company, d.country_code, d.spoken_language, d.translation_language, d.notes, existing.id
  )
  return c.json({ contact: await one(c.env.DB, 'SELECT * FROM contacts WHERE id = ?', existing.id) })
})

contacts.delete('/:id', async (c) => {
  const res = await run(c.env.DB, 'DELETE FROM contacts WHERE id = ? AND owner_user_id = ?', c.req.param('id'), c.var.user!.id)
  if (!res.meta.changes) return c.json({ error: 'Contact not found' }, 404)
  return c.json({ ok: true })
})

export default contacts
