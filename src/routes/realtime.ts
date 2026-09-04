/**
 * Realtime routes — everything the in-room client needs. All routes are authenticated by the
 * participant cookie (lb_participant) and scoped to the room slug.
 *
 *  GET  /api/rt/:slug/capabilities        what is configured (livekit / stt / translation / tts) — honest, never fakes
 *  POST /api/rt/:slug/livekit-token       short-lived LiveKit access token for THIS participant in THIS room
 *  POST /api/rt/:slug/stt-token           short-lived Deepgram token + listen URL params (key never leaves server)
 *  POST /api/rt/:slug/transcripts         persist transcript segment; finals are translated for every language group
 *  POST /api/rt/:slug/translate           on-demand translation (e.g. "show in my language" for late joiners)
 *  POST /api/rt/:slug/tts                 stream synthesized speech for a translated segment (mp3)
 *  PATCH /api/rt/:slug/media              mirror mic/camera state (analytics; LiveKit is the live source of truth)
 *  GET  /api/rt/:slug/transcript          transcript history for this room (participants: current session)
 *  POST /api/rt/:slug/heartbeat           presence keep-alive
 */
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppEnv, ParticipantRow } from '../types'
import { one, run } from '../lib/db'
import { readBody, str, bool, int, language, ValidationError } from '../lib/validation'
import { getMeeting } from '../services/meetings'
import { realtimeProviderStatus, mintLiveKitToken, livekitRoomService } from '../providers/realtime'
import { sttProviderStatus, getSttProvider, DeepgramProvider } from '../providers/stt'
import { translationProviderStatus, getTranslationProvider, translateCached } from '../providers/translation'
import { ttsProviderStatus, getTtsProvider } from '../providers/tts'
import { upsertTranscript, translateForRoom, meetingTranscript } from '../services/realtime'
import { rateLimit } from '../middleware/rate-limit'
import { sweepStaleParticipants } from './join'
import { sha256Hex } from '../lib/crypto'

const PARTICIPANT_COOKIE = 'lb_participant'
const rt = new Hono<AppEnv>()

type Ctx = { me: ParticipantRow; meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>> }

async function ctx(c: any): Promise<Ctx | null> {
  const token = getCookie(c, PARTICIPANT_COOKIE)
  if (!token) return null
  const me = await one<ParticipantRow>(
    c.env.DB,
    `SELECT p.* FROM meeting_participants p JOIN meeting_rooms r ON r.meeting_id = p.meeting_id WHERE p.participant_token = ? AND r.slug = ? AND p.status = 'joined'`,
    token, c.req.param('slug')
  )
  if (!me) return null
  const meeting = await getMeeting(c.env, me.meeting_id)
  if (!meeting || meeting.status === 'ended' || meeting.status === 'cancelled') return null
  return { me, meeting }
}

rt.use('/:slug/*', async (c, next) => {
  const x = await ctx(c)
  if (!x) return c.json({ error: 'Not an active participant of this room' }, 401)
  c.set('rt' as any, x)
  await next()
})
const X = (c: any): Ctx => c.get('rt')

rt.get('/:slug/capabilities', (c) => {
  const { meeting } = X(c)
  const lk = realtimeProviderStatus(c.env)
  const stt = sttProviderStatus(c.env)
  const tr = translationProviderStatus(c.env)
  const tts = ttsProviderStatus(c.env)
  return c.json({
    realtime_media: lk,
    speech_to_text: stt,
    translation: tr,
    text_to_speech: tts,
    meeting: { video_enabled: !!meeting.video_enabled, translation_enabled: !!meeting.translation_enabled },
    // What the UI may enable, derived honestly from configuration
    features: {
      audio: lk.configured,
      video: lk.configured && !!meeting.video_enabled,
      screen_share: lk.configured && !!meeting.video_enabled,
      presence_realtime: lk.configured,
      captions: stt.configured && !!meeting.translation_enabled,
      translation: stt.configured && tr.configured && !!meeting.translation_enabled,
      translated_voice: stt.configured && tr.configured && tts.configured && !!meeting.translation_enabled
    }
  })
})

rt.post('/:slug/livekit-token', rateLimit({ limit: 30, windowMs: 60_000, keyPrefix: 'lk' }), async (c) => {
  const { me, meeting } = X(c)
  const status = realtimeProviderStatus(c.env)
  if (!status.configured) return c.json({ error: 'Realtime media is not configured for this workspace', status }, 503)
  const room = await one<{ livekit_room_name: string }>(c.env.DB, 'SELECT livekit_room_name FROM meeting_rooms WHERE meeting_id = ?', meeting.id)
  const identity = me.id // stable per participant row
  const metadata = JSON.stringify({
    pid: me.id, role: me.role, country: me.country_code, spoken: me.spoken_language, receive: me.translation_language, mode: me.translation_mode
  })
  const sources: Array<'camera' | 'microphone' | 'screen_share' | 'screen_share_audio'> = ['microphone']
  if (meeting.video_enabled) sources.push('camera', 'screen_share', 'screen_share_audio')
  const t = await mintLiveKitToken(c.env, {
    identity, name: me.display_name, metadata, ttlSeconds: 6 * 3600,
    grant: { roomJoin: true, room: room!.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: sources, roomAdmin: me.role === 'host' }
  })
  await run(c.env.DB, 'UPDATE meeting_participants SET livekit_identity = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', identity, me.id)
  return c.json({ url: t.url, token: t.token, expires_at: t.expiresAt, identity, room: room!.livekit_room_name })
})

rt.post('/:slug/stt-token', rateLimit({ limit: 60, windowMs: 60_000, keyPrefix: 'stt' }), async (c) => {
  const { me, meeting } = X(c)
  if (!meeting.translation_enabled) return c.json({ error: 'Translation is disabled for this meeting' }, 403)
  const provider = getSttProvider(c.env)
  if (!provider) return c.json({ error: 'Speech recognition is not configured for this workspace', status: sttProviderStatus(c.env) }, 503)
  const body: Record<string, unknown> = await readBody(c.req.raw).catch(() => ({}))
  const sampleRate = int(body.sample_rate, 'sample_rate', { min: 8000, max: 48000, fallback: 16000 })
  const lang = me.auto_detect_language && meeting.auto_language_detection ? 'auto' : me.spoken_language
  const tok = await provider.createEphemeralToken(600)
  return c.json({
    provider: provider.name,
    token: tok.token,
    expires_at: tok.expiresAt,
    ws_url: `${tok.wsUrl}?${DeepgramProvider.listenParams(lang, sampleRate)}`,
    language: lang,
    sample_rate: sampleRate,
    // Browser must open the socket with Sec-WebSocket-Protocol: ["bearer", token]
    auth_scheme: 'bearer'
  })
})

rt.post('/:slug/transcripts', rateLimit({ limit: 600, windowMs: 60_000, keyPrefix: 'tx' }), async (c) => {
  const { me, meeting } = X(c)
  if (!meeting.translation_enabled) return c.json({ error: 'Translation is disabled for this meeting' }, 403)
  const body = await readBody(c.req.raw)
  const segment_id = str(body.segment_id, 'segment_id', { min: 4, max: 64 })
  const text = str(body.text, 'text', { min: 1, max: 4000 })
  const is_final = bool(body.is_final, false)
  // Deepgram `multi` may report a detected language; fall back to what the participant declared.
  let lang = typeof body.language === 'string' && body.language.length >= 2 ? body.language.slice(0, 2).toLowerCase() : me.spoken_language
  try { lang = language(lang, 'language') } catch { lang = me.spoken_language }
  const confidence = typeof body.confidence === 'number' ? Math.max(0, Math.min(1, body.confidence)) : undefined
  const start_ms = body.start_ms === undefined ? undefined : int(Math.round(Number(body.start_ms)), 'start_ms', { min: 0 })
  const end_ms = body.end_ms === undefined ? undefined : int(Math.round(Number(body.end_ms)), 'end_ms', { min: 0 })

  const transcriptId = await upsertTranscript(c.env, me, { segment_id, text, language: lang, is_final, confidence, start_ms, end_ms, provider: str(body.provider, 'provider', { optional: true, max: 40 }) || 'deepgram' })

  if (!is_final) return c.json({ transcript_id: transcriptId, segment_id, source_language: lang, is_final: false, translations: [], translation_groups: {} })

  const context = meeting.client_name ? `Business meeting "${meeting.name}" with client ${meeting.client_name}.` : `Business meeting "${meeting.name}".`
  const { translations, groups } = await translateForRoom(c.env, me, transcriptId, lang, text, context)
  return c.json({ transcript_id: transcriptId, segment_id, source_language: lang, is_final: true, translations, translation_groups: groups })
})

rt.post('/:slug/translate', rateLimit({ limit: 120, windowMs: 60_000, keyPrefix: 'tr' }), async (c) => {
  const { meeting } = X(c)
  if (!meeting.translation_enabled) return c.json({ error: 'Translation is disabled for this meeting' }, 403)
  const provider = getTranslationProvider(c.env)
  if (!provider) return c.json({ error: 'Translation is not configured for this workspace', status: translationProviderStatus(c.env) }, 503)
  const body = await readBody(c.req.raw)
  const text = str(body.text, 'text', { min: 1, max: 4000 })
  const source = language(body.source_language, 'source_language')
  const target = language(body.target_language, 'target_language')
  if (source === target) return c.json({ text, source_language: source, target_language: target, cache_hit: true, provider: 'identity', latency_ms: 0 })
  const r = await translateCached(c.env, provider, { text, sourceLanguage: source, targetLanguage: target })
  return c.json({ text: r.text, source_language: source, target_language: target, cache_hit: r.cacheHit, provider: r.provider, latency_ms: r.latencyMs })
})

rt.post('/:slug/tts', rateLimit({ limit: 120, windowMs: 60_000, keyPrefix: 'tts' }), async (c) => {
  const { me, meeting } = X(c)
  if (!meeting.translation_enabled) return c.json({ error: 'Translation is disabled for this meeting' }, 403)
  const provider = getTtsProvider(c.env)
  if (!provider) return c.json({ error: 'Translated voice is not configured for this workspace', status: ttsProviderStatus(c.env) }, 503)
  const body = await readBody(c.req.raw)
  const text = str(body.text, 'text', { min: 1, max: 2000 })
  const lang = language(body.language, 'language')
  const voice = str(body.voice, 'voice', { optional: true, max: 64 }) || undefined
  const result = await provider.synthesize({ text, language: lang, voice })
  run(c.env.DB, `INSERT INTO meeting_usage (meeting_id, tts_requests, tts_chars) VALUES (?, 1, ?) ON CONFLICT(meeting_id) DO UPDATE SET tts_requests = tts_requests + 1, tts_chars = tts_chars + excluded.tts_chars, updated_at = CURRENT_TIMESTAMP`, me.meeting_id, text.length).catch(() => {})
  const etag = await sha256Hex(`${provider.name}|${lang}|${voice ?? ''}|${text}`)
  return new Response(result.audio as any, { headers: { 'Content-Type': result.mimeType, 'Cache-Control': 'private, max-age=3600', ETag: `"${etag.slice(0, 32)}"`, 'X-TTS-Provider': result.provider } })
})

rt.patch('/:slug/media', async (c) => {
  const { me } = X(c)
  const body = await readBody(c.req.raw)
  const mic = bool(body.mic_enabled, !!me.mic_enabled)
  const cam = bool(body.camera_enabled, !!me.camera_enabled)
  await run(c.env.DB, 'UPDATE meeting_participants SET mic_enabled = ?, camera_enabled = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', mic ? 1 : 0, cam ? 1 : 0, me.id)
  return c.json({ ok: true, mic_enabled: mic, camera_enabled: cam })
})

rt.post('/:slug/heartbeat', async (c) => {
  const { me } = X(c)
  await run(c.env.DB, 'UPDATE meeting_participants SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', me.id)
  await sweepStaleParticipants(c.env.DB, me.meeting_id)
  return c.json({ ok: true })
})

rt.get('/:slug/transcript', async (c) => {
  const { me, meeting } = X(c)
  const limit = int(c.req.query('limit'), 'limit', { min: 1, max: 2000, fallback: 300 })
  // Participants see the current session only; hosts may request everything with ?all=1
  const all = me.role === 'host' && c.req.query('all') === '1'
  const rows = await meetingTranscript(c.env, meeting.id, { sessionId: all ? null : me.session_id, limit })
  return c.json({ transcript: rows, my_language: me.translation_language })
})

/** Host moderation: kick a participant (DB + LiveKit disconnect when configured). */
rt.post('/:slug/participants/:pid/remove', async (c) => {
  const { me, meeting } = X(c)
  if (me.role !== 'host') return c.json({ error: 'Host only' }, 403)
  const pid = c.req.param('pid')
  const target = await one<ParticipantRow>(c.env.DB, 'SELECT * FROM meeting_participants WHERE id = ? AND meeting_id = ?', pid, meeting.id)
  if (!target) return c.json({ error: 'Participant not found' }, 404)
  await run(c.env.DB, `UPDATE meeting_participants SET status = 'removed', left_at = CURRENT_TIMESTAMP WHERE id = ?`, pid)
  if (realtimeProviderStatus(c.env).configured && target.livekit_identity) {
    const room = await one<{ livekit_room_name: string }>(c.env.DB, 'SELECT livekit_room_name FROM meeting_rooms WHERE meeting_id = ?', meeting.id)
    await livekitRoomService(c.env, 'RemoveParticipant', { room: room!.livekit_room_name, identity: target.livekit_identity }).catch(() => {})
  }
  return c.json({ ok: true })
})

/** Host: end the meeting from inside the room (mirrors /api/meetings/:id/end; closes LiveKit room). */
rt.post('/:slug/end', async (c) => {
  const { me, meeting } = X(c)
  if (me.role !== 'host') return c.json({ error: 'Host only' }, 403)
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE meetings SET status = 'ended', ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(meeting.id),
    c.env.DB.prepare(`UPDATE meeting_sessions SET ended_at = CURRENT_TIMESTAMP,
        participant_count = (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = ? AND p.joined_at >= meeting_sessions.started_at),
        languages_used = (SELECT json_group_array(DISTINCT spoken_language) FROM meeting_participants p WHERE p.meeting_id = ? AND p.joined_at >= meeting_sessions.started_at)
      WHERE meeting_id = ? AND ended_at IS NULL`).bind(meeting.id, meeting.id, meeting.id),
    c.env.DB.prepare(`UPDATE meeting_participants SET status = 'left', left_at = CURRENT_TIMESTAMP WHERE meeting_id = ? AND status = 'joined'`).bind(meeting.id)
  ])
  if (realtimeProviderStatus(c.env).configured) {
    const room = await one<{ livekit_room_name: string }>(c.env.DB, 'SELECT livekit_room_name FROM meeting_rooms WHERE meeting_id = ?', meeting.id)
    await livekitRoomService(c.env, 'DeleteRoom', { room: room!.livekit_room_name }).catch(() => {})
  }
  return c.json({ ok: true })
})

export default rt
export { ValidationError }
