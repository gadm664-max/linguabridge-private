import { Hono } from 'hono'
import type { AppEnv, MeetingType } from '../types'
import { requireAuthApi } from '../lib/auth'
import { readBody, str, bool, int, oneOf, language, ValidationError } from '../lib/validation'
import { one, run } from '../lib/db'
import { publicOrigin } from '../lib/url'
import { uuid, randomToken, hashPassword } from '../lib/crypto'
import {
  createMeeting, getMeeting, listMeetings, updateMeetingStatus, listInvitations, listParticipants,
  publicMeeting, publicInvitation, publicParticipant
} from '../services/meetings'
import type { InvitationRow } from '../types'
import { sweepStaleParticipants } from './join'
import { meetingTranscript } from '../services/realtime'
import { many } from '../lib/db'
import { getLanguage } from '../lib/languages'

const meetings = new Hono<AppEnv>()
meetings.use('*', requireAuthApi)

const baseUrl = (c: { env: { APP_BASE_URL?: string }; req: { raw: Request } }) => publicOrigin(c.env, c.req.raw)

/** Ensures the meeting exists and belongs to the current user (host authorization). */
async function ownedMeeting(c: any, id: string) {
  const m = await getMeeting(c.env, id)
  if (!m || m.host_user_id !== c.var.user.id) return null
  return m
}

// ---- List / create -------------------------------------------------------
meetings.get('/', async (c) => {
  const type = c.req.query('type') as MeetingType | undefined
  const status = c.req.query('status')
  const rows = await listMeetings(c.env, c.var.user!.id, {
    type: type && ['instant', 'private_room', 'scheduled'].includes(type) ? type : undefined,
    status: status || undefined,
    limit: int(c.req.query('limit'), 'limit', { min: 1, max: 200, fallback: 50 })
  })
  return c.json({ meetings: rows.map(publicMeeting) })
})

meetings.post('/', async (c) => {
  const body = await readBody(c.req.raw)
  const type = oneOf<MeetingType>(body.type, 'type', ['instant', 'private_room', 'scheduled'], 'instant')
  const name = str(body.name, 'name', { min: 2, max: 120 })
  let scheduled_at: string | null = null
  if (type === 'scheduled') {
    const s = str(body.scheduled_at, 'scheduled_at')
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) throw new ValidationError('scheduled_at', 'Invalid date')
    scheduled_at = d.toISOString().slice(0, 19).replace('T', ' ')
  }
  const requirePassword = bool(body.require_password, false)
  const password = requirePassword ? str(body.password, 'password', { min: 4, max: 64 }) : null
  let client_contact_id: string | null = null
  if (type === 'private_room' && body.client_contact_id) {
    const cid = str(body.client_contact_id, 'client_contact_id')
    const owned = await one<{ id: string }>(c.env.DB, 'SELECT id FROM contacts WHERE id = ? AND owner_user_id = ?', cid, c.var.user!.id)
    if (!owned) throw new ValidationError('client_contact_id', 'Contact not found')
    client_contact_id = cid
  }
  const settings = await one<{ primary_spoken_language: string }>(c.env.DB, 'SELECT primary_spoken_language FROM user_settings WHERE user_id = ?', c.var.user!.id)

  const { meeting, invitation } = await createMeeting(c.env, {
    host_user_id: c.var.user!.id,
    name,
    type,
    scheduled_at,
    video_enabled: bool(body.video_enabled, true),
    translation_enabled: bool(body.translation_enabled, true),
    allow_language_selection: bool(body.allow_language_selection, true),
    auto_language_detection: bool(body.auto_language_detection, true),
    password,
    max_participants: int(body.max_participants, 'max_participants', { min: 2, max: 100, fallback: 25 }),
    host_language: language(body.host_language, 'host_language', settings?.primary_spoken_language ?? 'en'),
    client_name: type === 'private_room' ? str(body.client_name, 'client_name', { max: 120, optional: true }) || null : null,
    client_contact_id
  })
  return c.json({ meeting: publicMeeting(meeting), invitation: publicInvitation(invitation, baseUrl(c)) }, 201)
})

// ---- Single meeting ------------------------------------------------------
meetings.get('/:id', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  await sweepStaleParticipants(c.env.DB, m.id)
  const [invitations, participants] = await Promise.all([listInvitations(c.env, m.id), listParticipants(c.env, m.id)])
  return c.json({
    meeting: publicMeeting(m),
    invitations: invitations.map((i) => publicInvitation(i, baseUrl(c))),
    participants: participants.map(publicParticipant)
  })
})

meetings.patch('/:id', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const body = await readBody(c.req.raw)
  const sets: string[] = []
  const params: unknown[] = []
  if (body.name !== undefined) { sets.push('name = ?'); params.push(str(body.name, 'name', { min: 2, max: 120 })) }
  for (const k of ['video_enabled', 'translation_enabled', 'allow_language_selection', 'auto_language_detection'] as const) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); params.push(bool(body[k], true) ? 1 : 0) }
  }
  if (body.max_participants !== undefined) { sets.push('max_participants = ?'); params.push(int(body.max_participants, 'max_participants', { min: 2, max: 100 })) }
  if (body.host_language !== undefined) { sets.push('host_language = ?'); params.push(language(body.host_language, 'host_language')) }
  if (body.password !== undefined) {
    const pw = body.password === null || body.password === '' ? null : str(body.password, 'password', { min: 4, max: 64 })
    sets.push('password_hash = ?'); params.push(pw ? await hashPassword(pw) : null)
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP')
    params.push(m.id)
    await run(c.env.DB, `UPDATE meetings SET ${sets.join(', ')} WHERE id = ?`, ...params)
  }
  if (body.is_locked !== undefined) await run(c.env.DB, 'UPDATE meeting_rooms SET is_locked = ? WHERE meeting_id = ?', bool(body.is_locked, false) ? 1 : 0, m.id)
  if (body.client_name !== undefined && m.type === 'private_room') await run(c.env.DB, 'UPDATE meeting_rooms SET client_name = ? WHERE meeting_id = ?', str(body.client_name, 'client_name', { max: 120, optional: true }) || null, m.id)
  return c.json({ meeting: publicMeeting((await getMeeting(c.env, m.id))!) })
})

meetings.post('/:id/start', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  await updateMeetingStatus(c.env, m.id, 'active')
  await run(c.env.DB, 'INSERT INTO meeting_sessions (id, meeting_id) VALUES (?, ?)', uuid(), m.id)
  return c.json({ meeting: publicMeeting((await getMeeting(c.env, m.id))!) })
})

meetings.post('/:id/end', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  await updateMeetingStatus(c.env, m.id, 'ended')
  await run(c.env.DB, `UPDATE meeting_sessions SET ended_at = CURRENT_TIMESTAMP,
      participant_count = (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = ? AND p.joined_at >= meeting_sessions.started_at)
    WHERE meeting_id = ? AND ended_at IS NULL`, m.id, m.id)
  return c.json({ meeting: publicMeeting((await getMeeting(c.env, m.id))!) })
})

meetings.delete('/:id', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  await run(c.env.DB, 'DELETE FROM meetings WHERE id = ?', m.id) // cascades
  return c.json({ ok: true })
})

// ---- Invitations ---------------------------------------------------------
meetings.get('/:id/invitations', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  return c.json({ invitations: (await listInvitations(c.env, m.id)).map((i) => publicInvitation(i, baseUrl(c))) })
})

meetings.post('/:id/invitations', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const body = await readBody(c.req.raw)
  const label = str(body.label, 'label', { max: 80, optional: true }) || null
  const invited_email = body.invited_email ? str(body.invited_email, 'invited_email', { max: 254 }).toLowerCase() : null
  const single_use = bool(body.single_use, false)
  const is_persistent = bool(body.is_persistent, m.type === 'private_room')
  const max_uses = body.max_uses === undefined || body.max_uses === null || body.max_uses === '' ? null : int(body.max_uses, 'max_uses', { min: 1, max: 1000 })
  let expires_at: string | null = null
  if (body.expires_in_hours !== undefined && body.expires_in_hours !== null && body.expires_in_hours !== '') {
    const h = int(body.expires_in_hours, 'expires_in_hours', { min: 1, max: 24 * 365 })
    expires_at = new Date(Date.now() + h * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
  } else if (!is_persistent) {
    expires_at = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 19).replace('T', ' ')
  }
  const password = body.password ? str(body.password, 'password', { min: 4, max: 64 }) : null
  const id = uuid()
  await run(
    c.env.DB,
    `INSERT INTO meeting_invitations (id, meeting_id, token, label, invited_email, password_hash, expires_at, max_uses, single_use, is_persistent, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, m.id, randomToken(20), label, invited_email, password ? await hashPassword(password) : null, expires_at, max_uses, single_use ? 1 : 0, is_persistent ? 1 : 0, c.var.user!.id
  )
  const inv = (await one<InvitationRow>(c.env.DB, 'SELECT * FROM meeting_invitations WHERE id = ?', id))!
  return c.json({ invitation: publicInvitation(inv, baseUrl(c)) }, 201)
})

meetings.patch('/:id/invitations/:invId', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const body = await readBody(c.req.raw)
  const inv = await one<InvitationRow>(c.env.DB, 'SELECT * FROM meeting_invitations WHERE id = ? AND meeting_id = ?', c.req.param('invId'), m.id)
  if (!inv) return c.json({ error: 'Invitation not found' }, 404)
  if (body.is_active !== undefined) await run(c.env.DB, 'UPDATE meeting_invitations SET is_active = ? WHERE id = ?', bool(body.is_active, true) ? 1 : 0, inv.id)
  if (body.label !== undefined) await run(c.env.DB, 'UPDATE meeting_invitations SET label = ? WHERE id = ?', str(body.label, 'label', { max: 80, optional: true }) || null, inv.id)
  const updated = (await one<InvitationRow>(c.env.DB, 'SELECT * FROM meeting_invitations WHERE id = ?', inv.id))!
  return c.json({ invitation: publicInvitation(updated, baseUrl(c)) })
})

meetings.delete('/:id/invitations/:invId', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  await run(c.env.DB, 'DELETE FROM meeting_invitations WHERE id = ? AND meeting_id = ?', c.req.param('invId'), m.id)
  return c.json({ ok: true })
})

// ---- Participants (host management) --------------------------------------
meetings.get('/:id/participants', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  return c.json({ participants: (await listParticipants(c.env, m.id)).map(publicParticipant) })
})

meetings.post('/:id/participants/:pid/remove', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const res = await run(c.env.DB, `UPDATE meeting_participants SET status = 'removed', left_at = CURRENT_TIMESTAMP WHERE id = ? AND meeting_id = ? AND role != 'host'`, c.req.param('pid'), m.id)
  if (!res.meta.changes) return c.json({ error: 'Participant not found' }, 404)
  return c.json({ ok: true })
})

// ---- History: sessions, transcript, usage, export (Phase 7) -----------------
meetings.get('/:id/sessions', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const sessions = await many<any>(c.env.DB,
    `SELECT s.id, s.started_at, s.ended_at, s.participant_count, s.languages_used,
            (SELECT COUNT(*) FROM meeting_transcripts t WHERE t.session_id = s.id AND t.is_final = 1) AS segments,
            ROUND((julianday(COALESCE(s.ended_at, CURRENT_TIMESTAMP)) - julianday(s.started_at)) * 1440) AS minutes
       FROM meeting_sessions s WHERE s.meeting_id = ? ORDER BY s.started_at DESC LIMIT 100`, m.id)
  const usage = await one(c.env.DB, 'SELECT * FROM meeting_usage WHERE meeting_id = ?', m.id)
  return c.json({ sessions: sessions.map((s) => ({ ...s, languages_used: s.languages_used ? JSON.parse(s.languages_used) : [] })), usage })
})

meetings.get('/:id/transcript', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const sessionId = c.req.query('session') || null
  const rows = await meetingTranscript(c.env, m.id, { sessionId, limit: int(c.req.query('limit'), 'limit', { min: 1, max: 2000, fallback: 1000 }) })
  const languages = [...new Set(rows.flatMap((r) => [r.detected_language, ...Object.keys(r.translations)]))]
  return c.json({ transcript: rows, languages, host_language: m.host_language })
})

/** Export transcript as txt | srt | csv in a chosen language (falls back to original when no translation exists). */
meetings.get('/:id/transcript/export', async (c) => {
  const m = await ownedMeeting(c, c.req.param('id'))
  if (!m) return c.json({ error: 'Meeting not found' }, 404)
  const format = oneOf(c.req.query('format'), 'format', ['txt', 'srt', 'csv'] as const, 'txt')
  const lang = c.req.query('lang') || 'original'
  const rows = await meetingTranscript(c.env, m.id, { sessionId: c.req.query('session') || null, limit: 2000 })
  const pick = (r: any) => (lang === 'original' || r.detected_language === lang ? r.text : r.translations[lang] || r.text)
  const ts = (ms: number) => { const d = new Date(Math.max(0, ms || 0)); return d.toISOString().slice(11, 23).replace('.', ',') }
  const safe = m.name.replace(/[^\w\-]+/g, '_').slice(0, 60)
  let body = '', type = 'text/plain; charset=utf-8'
  if (format === 'txt') {
    body = `${m.name}\n${'='.repeat(m.name.length)}\nLanguage: ${lang === 'original' ? 'original' : getLanguage(lang)?.name ?? lang}\nExported: ${new Date().toISOString()}\n\n` +
      rows.map((r) => `[${r.created_at}] ${r.display_name} (${r.detected_language}): ${pick(r)}`).join('\n')
  } else if (format === 'srt') {
    body = rows.map((r, i) => `${i + 1}\n${ts(r.started_at_ms ?? i * 3000)} --> ${ts(r.ended_at_ms ?? (r.started_at_ms ?? i * 3000) + 3000)}\n${r.display_name}: ${pick(r)}\n`).join('\n')
    type = 'application/x-subrip; charset=utf-8'
  } else {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const langs = [...new Set(rows.flatMap((r) => Object.keys(r.translations)))].sort()
    body = ['time', 'speaker', 'country', 'language', 'original', ...langs].map(q).join(',') + '\n' +
      rows.map((r) => [r.created_at, r.display_name, r.country_code, r.detected_language, r.text, ...langs.map((l) => r.translations[l] ?? '')].map(q).join(',')).join('\n')
    type = 'text/csv; charset=utf-8'
  }
  return new Response('\ufeff' + body, { headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${safe}_${lang}.${format}"` } })
})

export default meetings
