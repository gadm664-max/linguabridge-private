/**
 * Real-time event contract (section 19).
 * Declared in Phase 1 so every later phase (LiveKit data channel transport, STT, translation, TTS)
 * shares ONE type-safe schema. No transport is implemented here yet.
 */
import type { LanguagePreferences, TranslationMode } from '../types'

export type RealtimeEvent =
  | { type: 'participant_joined'; participant: ParticipantSummary }
  | { type: 'participant_left'; participant_id: string }
  | { type: 'participant_updated'; participant_id: string; preferences: Partial<LanguagePreferences> }
  | { type: 'audio_started'; participant_id: string }
  | { type: 'audio_stopped'; participant_id: string }
  | { type: 'partial_transcript'; segment_id: string; participant_id: string; language: string; text: string }
  | { type: 'final_transcript'; segment_id: string; participant_id: string; language: string; text: string; confidence?: number }
  | { type: 'translation_started'; segment_id: string; target_language: string }
  | { type: 'translation_updated'; segment_id: string; target_language: string; text: string }
  | { type: 'translation_completed'; segment_id: string; source_language: string; target_language: string; text: string; cache_hit: boolean }
  | { type: 'translated_audio_ready'; segment_id: string; target_language: string; audio_url: string; duration_ms: number }
  | { type: 'meeting_ended'; meeting_id: string; ended_by: string }

export interface ParticipantSummary {
  id: string
  display_name: string
  role: 'host' | 'participant'
  country_code: string | null
  spoken_language: string
  translation_language: string
  translation_mode: TranslationMode
  auto_detect_language: boolean
}

/**
 * Groups participants by the language they want to RECEIVE (section 4).
 * Translation happens once per group, never once per participant.
 */
export function buildTranslationGroups(
  participants: Array<Pick<ParticipantSummary, 'id' | 'translation_language'>>,
  sourceLanguage: string
): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const p of participants) {
    if (p.translation_language === sourceLanguage) continue // speaker's own language: original text only
    const list = groups.get(p.translation_language) ?? []
    list.push(p.id)
    groups.set(p.translation_language, list)
  }
  return groups
}
