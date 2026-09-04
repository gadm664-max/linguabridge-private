// Shared backend types for LinguaBridge

export type Bindings = {
  DB: D1Database
  SESSION_SECRET: string
  APP_BASE_URL?: string
  APP_NAME?: string
  APP_ENV?: string
  // Phase 2+ (optional, feature-gated)
  LIVEKIT_URL?: string
  LIVEKIT_API_KEY?: string
  LIVEKIT_API_SECRET?: string
  DEEPGRAM_API_KEY?: string
  TRANSLATION_PROVIDER?: string
  GEMINI_API_KEY?: string
  GEMINI_BASE_URL?: string
  GEMINI_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
  TTS_PROVIDER?: string
  TTS_API_KEY?: string
  TTS_BASE_URL?: string
  TTS_MODEL?: string
}

export type AuthUser = {
  id: string
  email: string
  name: string
  company: string | null
  avatar_url: string | null
  created_at: string
}

export type Variables = {
  user: AuthUser | null
  sessionId: string | null
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }

export type MeetingType = 'instant' | 'private_room' | 'scheduled'
export type MeetingStatus = 'scheduled' | 'active' | 'ended' | 'cancelled'
export type TranslationMode = 'text' | 'text_voice' | 'voice'
export type ParticipantRole = 'host' | 'participant'

export interface MeetingRow {
  id: string
  host_user_id: string
  name: string
  type: MeetingType
  status: MeetingStatus
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  video_enabled: number
  translation_enabled: number
  allow_language_selection: number
  auto_language_detection: number
  recording_enabled: number
  password_hash: string | null
  max_participants: number
  host_language: string
  created_at: string
  updated_at: string
}

export interface RoomRow {
  id: string
  meeting_id: string
  slug: string
  livekit_room_name: string | null
  is_persistent: number
  client_name: string | null
  client_contact_id: string | null
  is_locked: number
  created_at: string
}

export interface InvitationRow {
  id: string
  meeting_id: string
  token: string
  label: string | null
  invited_email: string | null
  password_hash: string | null
  expires_at: string | null
  max_uses: number | null
  use_count: number
  single_use: number
  is_persistent: number
  is_active: number
  created_by: string
  created_at: string
}

export interface ParticipantRow {
  id: string
  meeting_id: string
  session_id: string | null
  user_id: string | null
  invitation_id: string | null
  display_name: string
  role: ParticipantRole
  participant_token: string
  country_code: string | null
  spoken_language: string
  translation_language: string
  auto_detect_language: number
  translation_mode: TranslationMode
  show_original_text: number
  original_audio_volume: number
  translated_audio_volume: number
  status: 'joined' | 'left' | 'removed'
  joined_at: string
  left_at: string | null
  // Phase 2+
  mic_enabled: number
  camera_enabled: number
  livekit_identity: string | null
  last_seen_at: string | null
}

/** Participant language preferences as exchanged with the client (section 14). */
export interface LanguagePreferences {
  country_code: string | null
  spoken_language: string
  translation_language: string
  auto_detect_language: boolean
  translation_mode: TranslationMode
  show_original_text: boolean
  original_audio_volume: number
  translated_audio_volume: number
}
