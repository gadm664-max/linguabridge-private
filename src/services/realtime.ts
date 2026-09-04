/**
 * Realtime pipeline service (Phases 2–6).
 *
 *  speech ─▶ browser STT (Deepgram, ephemeral token) ─▶ POST /api/rt/:slug/transcripts
 *        ─▶ persist transcript ─▶ translation groups (one call per TARGET language, cached)
 *        ─▶ persist translations ─▶ response fan-out via LiveKit data channel (browser publishes)
 *
 * The Worker is stateless: every step is a request/response. The speaker's browser is the
 * "publisher" of the resulting events over LiveKit's reliable data channel, so every listener
 * receives the translated captions in real time without polling.
 */
import type { Bindings, ParticipantRow } from '../types'
import { one, many, run } from '../lib/db'
import { uuid } from '../lib/crypto'
import { buildTranslationGroups } from '../lib/events'
import { getTranslationProvider, translateCached } from '../providers/translation'
import { isSupportedLanguage } from '../lib/languages'

export interface TranscriptInput {
  segment_id: string
  text: string
  language: string
  is_final: boolean
  confidence?: number
  start_ms?: number
  end_ms?: number
  provider?: string
}

export interface TranslationOut {
  target_language: string
  text: string
  cache_hit: boolean
  latency_ms: number
  provider: string
  error?: string
}

export interface TranscriptResult {
  transcript_id: string
  segment_id: string
  source_language: string
  is_final: boolean
  translations: TranslationOut[]
  translation_groups: Record<string, string[]>
}

/** Persist a (partial or final) transcript segment. Finals overwrite partials with the same segment_id. */
export async function upsertTranscript(env: Bindings, me: ParticipantRow, input: TranscriptInput): Promise<string> {
  const existing = await one<{ id: string; is_final: number }>(env.DB, 'SELECT id, is_final FROM meeting_transcripts WHERE meeting_id = ? AND segment_id = ?', me.meeting_id, input.segment_id)
  if (existing) {
    if (existing.is_final && !input.is_final) return existing.id // never downgrade a final
    await run(
      env.DB,
      `UPDATE meeting_transcripts SET text = ?, detected_language = ?, is_final = ?, confidence = ?, started_at_ms = ?, ended_at_ms = ?, provider = ? WHERE id = ?`,
      input.text, input.language, input.is_final ? 1 : 0, input.confidence ?? null, input.start_ms ?? null, input.end_ms ?? null, input.provider ?? null, existing.id
    )
    return existing.id
  }
  const id = uuid()
  await run(
    env.DB,
    `INSERT INTO meeting_transcripts (id, meeting_id, session_id, participant_id, detected_language, text, is_final, confidence, started_at_ms, ended_at_ms, provider, segment_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, me.meeting_id, me.session_id, me.id, input.language, input.text, input.is_final ? 1 : 0, input.confidence ?? null, input.start_ms ?? null, input.end_ms ?? null, input.provider ?? null, input.segment_id
  )
  return id
}

/**
 * Translate a final transcript for every language group present in the room.
 * Exactly ONE provider call per distinct target language (cache permitting).
 */
export async function translateForRoom(env: Bindings, me: ParticipantRow, transcriptId: string, sourceLanguage: string, text: string, meetingContext?: string): Promise<{ translations: TranslationOut[]; groups: Record<string, string[]> }> {
  const listeners = await many<{ id: string; translation_language: string }>(
    env.DB, `SELECT id, translation_language FROM meeting_participants WHERE meeting_id = ? AND status = 'joined'`, me.meeting_id
  )
  const groupMap = buildTranslationGroups(listeners, sourceLanguage)
  const groups = Object.fromEntries(groupMap)
  const provider = getTranslationProvider(env)
  if (!provider || groupMap.size === 0) return { translations: [], groups }

  const targets = [...groupMap.keys()].filter((t) => isSupportedLanguage(t) && provider.supportsLanguagePair(sourceLanguage, t))
  const results = await Promise.all(
    targets.map(async (target): Promise<TranslationOut> => {
      try {
        const r = await translateCached(env, provider, { text, sourceLanguage, targetLanguage: target, context: meetingContext })
        return { target_language: target, text: r.text, cache_hit: r.cacheHit, latency_ms: r.latencyMs, provider: r.provider }
      } catch (err: any) {
        return { target_language: target, text: '', cache_hit: false, latency_ms: 0, provider: provider.name, error: String(err?.message ?? err).slice(0, 200) }
      }
    })
  )

  const ok = results.filter((r) => r.text && !r.error)
  if (ok.length) {
    await env.DB.batch([
      ...ok.map((r) =>
        env.DB.prepare(
          `INSERT INTO meeting_translations (id, transcript_id, meeting_id, source_language, target_language, text, provider, cache_hit, latency_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(transcript_id, target_language) DO UPDATE SET text = excluded.text, provider = excluded.provider, cache_hit = excluded.cache_hit, latency_ms = excluded.latency_ms`
        ).bind(uuid(), transcriptId, me.meeting_id, sourceLanguage, r.target_language, r.text, r.provider, r.cache_hit ? 1 : 0, r.latency_ms)
      ),
      env.DB.prepare(
        `INSERT INTO meeting_usage (meeting_id, transcript_segments, transcript_chars, translations, translation_cache_hits) VALUES (?, 1, ?, ?, ?)
         ON CONFLICT(meeting_id) DO UPDATE SET transcript_segments = transcript_segments + 1, transcript_chars = transcript_chars + excluded.transcript_chars,
           translations = translations + excluded.translations, translation_cache_hits = translation_cache_hits + excluded.translation_cache_hits, updated_at = CURRENT_TIMESTAMP`
      ).bind(me.meeting_id, text.length, ok.length, ok.filter((r) => r.cache_hit).length)
    ])
  } else {
    await run(
      env.DB,
      `INSERT INTO meeting_usage (meeting_id, transcript_segments, transcript_chars) VALUES (?, 1, ?)
       ON CONFLICT(meeting_id) DO UPDATE SET transcript_segments = transcript_segments + 1, transcript_chars = transcript_chars + excluded.transcript_chars, updated_at = CURRENT_TIMESTAMP`,
      me.meeting_id, text.length
    )
  }
  return { translations: results, groups }
}

/** Full transcript history for a meeting (host view / participant catch-up). */
export async function meetingTranscript(env: Bindings, meetingId: string, opts: { sessionId?: string | null; limit?: number; finalOnly?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000)
  const rows = await many<any>(
    env.DB,
    `SELECT t.id, t.segment_id, t.participant_id, p.display_name, p.country_code, t.detected_language, t.text, t.is_final, t.confidence, t.started_at_ms, t.ended_at_ms, t.created_at
       FROM meeting_transcripts t JOIN meeting_participants p ON p.id = t.participant_id
      WHERE t.meeting_id = ? ${opts.sessionId ? 'AND t.session_id = ?' : ''} ${opts.finalOnly === false ? '' : 'AND t.is_final = 1'}
      ORDER BY t.created_at ASC, t.started_at_ms ASC LIMIT ?`,
    ...(opts.sessionId ? [meetingId, opts.sessionId, limit] : [meetingId, limit])
  )
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const chunks: any[] = []
  for (let i = 0; i < ids.length; i += 90) {
    const slice = ids.slice(i, i + 90)
    chunks.push(...(await many<any>(env.DB, `SELECT transcript_id, target_language, text, cache_hit FROM meeting_translations WHERE transcript_id IN (${slice.map(() => '?').join(',')})`, ...slice)))
  }
  const byT = new Map<string, Record<string, string>>()
  for (const tr of chunks) { const m = byT.get(tr.transcript_id) ?? {}; m[tr.target_language] = tr.text; byT.set(tr.transcript_id, m) }
  return rows.map((r) => ({ ...r, is_final: !!r.is_final, translations: byT.get(r.id) ?? {} }))
}
