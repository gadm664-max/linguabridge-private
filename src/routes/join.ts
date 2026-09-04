/**
 * Public join flow: /api/join/:token
 *  GET   → invitation + meeting summary (what the pre-join screen needs)
 *  POST  → validate name + country + language preferences, create participant, set participant cookie
 * Also: /api/participants/me (read/update own preferences), /api/participants/me/leave
 */
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AppEnv, ParticipantRow, LanguagePreferences } from '../types'
import { one, run } from '../lib/db'
import { uuid, randomToken, verifyPassword } from '../lib/crypto'
import { readBody, str, languagePreferences, ValidationError } from '../lib/validation'
import { checkInvitation, INVITATION_ERROR_MESSAGES, getMeeting, publicParticipant, listParticipants } from '../services/meetings'
import { rateLimit } from '../middleware/rate-limit'
import { isSecureRequest } from '../lib/url'
import { LANGUAGES } from '../lib/languages'
import { COUNTRIES } from '../lib/countries'

export const PARTICIPANT_COOKIE = 'lb_participant'
const join = new Hono<AppEnv>()

join.use('/:token', rateLimit({ limit: 30, windowMs: 60_000, keyPrefix: 'join' }))

join.get('/:token', async (c) => {
  const check = await checkInvitation(c.env, c.req.param('token'))
  if (!check.ok) return c.json({ error: INVITATION_ERROR_MESSAGES[check.reason], reason: check.reason }, 410)
  const { meeting, invitation } = check
  const host = await one<{ name: string; company: string | null }>(c.env.DB, 'SELECT name, company FROM users WHERE id = ?', meeting.host_user_id)
  const activeCount = await one<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM meeting_participants WHERE meeting_id = ? AND status = 'joined'`, meeting.id)

  // Pre-fill defaults from the current user's settings if logged in
  let defaults: Partial<LanguagePreferences> & { display_name?: string } = {}
  if (c.var.user) {
    const s = await one<any>(c.env.DB, 'SELECT * FROM user_settings WHERE user_id = ?', c.var.user.id)
    defaults = {
      display_name: c.var.user.name,
      country_code: s?.country_code ?? null,
      spoken_language: s?.primary_spoken_language ?? 'en',
      translation_language: s?.preferred_translation_language ?? 'en',
      auto_detect_language: !!(s?.auto_language_detection ?? 1),
      translation_mode: s?.translation_mode ?? 'text'
    }
  }

  return c.json({
    meeting: {
      id: meeting.id,
      name: meeting.name,
      type: meeting.type,
      status: meeting.status,
      slug: meeting.slug,
      client_name: meeting.client_name,
      video_enabled: !!meeting.video_enabled,
      translation_enabled: !!meeting.translation_enabled,
      allow_language_selection: !!meeting.allow_language_selection,
      auto_language_detection: !!meeting.auto_language_detection,
      max_participants: meeting.max_participants,
      host_language: meeting.host_language,
      requires_password: !!(meeting.password_hash || invitation.password_hash),
      scheduled_at: meeting.scheduled_at,
      active_participants: activeCount?.n ?? 0
    },
    host: host ? { name: host.name, company: host.company } : null,
    invitation: { label: invitation.label, is_persistent: !!invitation.is_persistent },
    defaults,
    languages: LANGUAGES,
    countries: COUNTRIES,
    is_host: !!c.var.user && c.var.user.id === meeting.host_user_id
  })
})

join.post('/:token', async (c) => {
  const check = await checkInvitation(c.env, c.req.param('token'))
  if (!check.ok) return c.json({ error: INVITATION_ERROR_MESSAGES[check.reason], reason: check.reason }, 410)
  const { meeting, invitation } = check
  const body = await readBody(c.req.raw)

  const display_name = str(body.display_name, 'display_name', { min: 1, max: 60 })

  // Password (meeting-level and/or link-level)
  const requiredHash = invitation.password_hash ?? meeting.password_hash
  const isHost = !!c.var.user && c.var.user.id === meeting.host_user_id
  if (requiredHash && !isHost) {
    const pw = str(body.password, 'password', { optional: true })
    if (!pw || !(await verifyPassword(pw, requiredHash))) return c.json({ error: 'Incorrect meeting password', field: 'password' }, 403)
  }

  // Capacity
  const active = await one<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM meeting_participants WHERE meeting_id = ? AND status = 'joined'`, meeting.id)
  if ((active?.n ?? 0) >= meeting.max_participants && !isHost) return c.json({ error: 'This meeting is full' }, 409)

  // Language preferences — country stored separately (AD-8)
  let prefs: LanguagePreferences
  if (meeting.allow_language_selection || isHost) {
    prefs = languagePreferences(body)
  } else {
    // Host disabled per-participant selection: everyone receives the host language,
    // but the participant still declares what they SPEAK (needed for STT/detection).
    const p = languagePreferences({ ...body, translation_language: meeting.host_language })
    prefs = p
  }
  if (!meeting.auto_language_detection) prefs.auto_detect_language = false

  // Re-joining: same browser (participant cookie) → update existing row instead of duplicating.
  const existingToken = getCookie(c, PARTICIPANT_COOKIE)
  let participant: ParticipantRow | null = null
  let participantId: string
  if (existingToken) {
    participant = await one<ParticipantRow>(c.env.DB, 'SELECT * FROM meeting_participants WHERE participant_token = ? AND meeting_id = ?', existingToken, meeting.id)
    if (participant?.status === 'removed') return c.json({ error: 'You were removed from this meeting by the host' }, 403)
  }
  // Signed-in user re-joining from another browser/device: reuse their row (no duplicate participants).
  if (!participant && c.var.user) {
    participant = await one<ParticipantRow>(c.env.DB, `SELECT * FROM meeting_participants WHERE user_id = ? AND meeting_id = ? AND status != 'removed' ORDER BY joined_at DESC LIMIT 1`, c.var.user.id, meeting.id)
  }

  if (participant) {
    participantId = participant.id
    // Rotate the browser token when this browser doesn't hold it yet (device switch).
    const token = existingToken === participant.participant_token ? participant.participant_token : randomToken(24)
    await run(
      c.env.DB,
      `UPDATE meeting_participants SET display_name = ?, country_code = ?, spoken_language = ?, translation_language = ?, auto_detect_language = ?,
         translation_mode = ?, show_original_text = ?, original_audio_volume = ?, translated_audio_volume = ?, status = 'joined', left_at = NULL, joined_at = CURRENT_TIMESTAMP,
         last_seen_at = CURRENT_TIMESTAMP, participant_token = ?
       WHERE id = ?`,
      display_name, prefs.country_code, prefs.spoken_language, prefs.translation_language, prefs.auto_detect_language ? 1 : 0,
      prefs.translation_mode, prefs.show_original_text ? 1 : 0, prefs.original_audio_volume, prefs.translated_audio_volume, token, participant.id
    )
    if (token !== existingToken) setCookie(c, PARTICIPANT_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(c.req.raw), path: '/', maxAge: 60 * 60 * 24 })
    await run(c.env.DB, `UPDATE meetings SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), ended_at = NULL WHERE id = ? AND status IN ('ended', 'scheduled')`, meeting.id)
  } else {
    const id = uuid()
    participantId = id
    const token = randomToken(24)
    const session = await one<{ id: string }>(c.env.DB, 'SELECT id FROM meeting_sessions WHERE meeting_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', meeting.id)
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO meeting_participants (id, meeting_id, session_id, user_id, invitation_id, display_name, role, participant_token,
           country_code, spoken_language, translation_language, auto_detect_language, translation_mode, show_original_text,
           original_audio_volume, translated_audio_volume, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        id, meeting.id, session?.id ?? null, c.var.user?.id ?? null, invitation.id, display_name, isHost ? 'host' : 'participant', token,
        prefs.country_code, prefs.spoken_language, prefs.translation_language, prefs.auto_detect_language ? 1 : 0, prefs.translation_mode,
        prefs.show_original_text ? 1 : 0, prefs.original_audio_volume, prefs.translated_audio_volume
      ),
      c.env.DB.prepare('UPDATE meeting_invitations SET use_count = use_count + 1 WHERE id = ?').bind(invitation.id),
      // A persistent private room becomes active again when someone enters it.
      c.env.DB.prepare(`UPDATE meetings SET status = 'active', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), ended_at = NULL WHERE id = ? AND status IN ('ended', 'scheduled')`).bind(meeting.id)
    ])
    setCookie(c, PARTICIPANT_COOKIE, token, {
      httpOnly: true, sameSite: 'Lax', secure: isSecureRequest(c.req.raw), path: '/', maxAge: 60 * 60 * 24
    })
  }

  const row = (await one<ParticipantRow>(c.env.DB, 'SELECT * FROM meeting_participants WHERE id = ?', participantId))!

  return c.json({ participant: publicParticipant(row), room_url: `/room/${meeting.slug}` }, 201)
})

// ---- Participant self-service ---------------------------------------------
export const participants = new Hono<AppEnv>()

/** Presence sweep: participants with no heartbeat for 3 minutes are marked as left (closed tab, crashed browser). */
export async function sweepStaleParticipants(db: D1Database, meetingId: string) {
  await db.prepare(`UPDATE meeting_participants SET status = 'left', left_at = CURRENT_TIMESTAMP
     WHERE meeting_id = ? AND status = 'joined' AND COALESCE(last_seen_at, joined_at) < datetime('now', '-3 minutes')`).bind(meetingId).run().catch(() => {})
}

export async function currentParticipant(c: any, slug: string): Promise<ParticipantRow | null> {
  const token = getCookie(c, PARTICIPANT_COOKIE)
  if (!token) return null
  return one<ParticipantRow>(
    c.env.DB,
    `SELECT p.* FROM meeting_participants p JOIN meeting_rooms r ON r.meeting_id = p.meeting_id WHERE p.participant_token = ? AND r.slug = ? AND p.status = 'joined'`,
    token, slug
  )
}

participants.get('/:slug/me', async (c) => {
  const me = await currentParticipant(c, c.req.param('slug'))
  if (!me) return c.json({ error: 'Not a participant of this room' }, 401)
  await run(c.env.DB, 'UPDATE meeting_participants SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', me.id)
  await sweepStaleParticipants(c.env.DB, me.meeting_id)
  const meeting = await getMeeting(c.env, me.meeting_id)
  const others = (await listParticipants(c.env, me.meeting_id)).filter((p) => p.status === 'joined').map(publicParticipant)
  return c.json({
    participant: publicParticipant(me),
    meeting: meeting && { id: meeting.id, name: meeting.name, type: meeting.type, status: meeting.status, slug: meeting.slug, video_enabled: !!meeting.video_enabled, translation_enabled: !!meeting.translation_enabled, client_name: meeting.client_name },
    participants: others
  })
})

participants.patch('/:slug/me', async (c) => {
  const me = await currentParticipant(c, c.req.param('slug'))
  if (!me) return c.json({ error: 'Not a participant of this room' }, 401)
  const body = await readBody(c.req.raw)
  const prefs = languagePreferences(body, {
    country_code: me.country_code, spoken_language: me.spoken_language, translation_language: me.translation_language,
    auto_detect_language: !!me.auto_detect_language, translation_mode: me.translation_mode, show_original_text: !!me.show_original_text,
    original_audio_volume: me.original_audio_volume, translated_audio_volume: me.translated_audio_volume
  })
  const display_name = body.display_name !== undefined ? str(body.display_name, 'display_name', { min: 1, max: 60 }) : me.display_name
  await run(
    c.env.DB,
    `UPDATE meeting_participants SET display_name = ?, country_code = ?, spoken_language = ?, translation_language = ?, auto_detect_language = ?,
       translation_mode = ?, show_original_text = ?, original_audio_volume = ?, translated_audio_volume = ? WHERE id = ?`,
    display_name, prefs.country_code, prefs.spoken_language, prefs.translation_language, prefs.auto_detect_language ? 1 : 0,
    prefs.translation_mode, prefs.show_original_text ? 1 : 0, prefs.original_audio_volume, prefs.translated_audio_volume, me.id
  )
  return c.json({ participant: publicParticipant((await one<ParticipantRow>(c.env.DB, 'SELECT * FROM meeting_participants WHERE id = ?', me.id))!) })
})

participants.post('/:slug/me/leave', async (c) => {
  const me = await currentParticipant(c, c.req.param('slug'))
  if (!me) return c.json({ error: 'Not a participant of this room' }, 401)
  await run(c.env.DB, `UPDATE meeting_participants SET status = 'left', left_at = CURRENT_TIMESTAMP WHERE id = ?`, me.id)
  deleteCookie(c, PARTICIPANT_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

export default join
export { ValidationError }
