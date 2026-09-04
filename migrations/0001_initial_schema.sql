-- LinguaBridge — Phase 1 schema (Cloudflare D1 / SQLite)
-- Country is ALWAYS stored separately from language preferences (AD-8).

-- ---------------------------------------------------------------------------
-- Users & auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- PBKDF2-SHA256, format: pbkdf2$iters$salt$hash (base64)
  name TEXT NOT NULL,
  company TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                  -- random 256-bit token (hashed with SHA-256 before storage)
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Default language preferences of the account owner (pre-fills join screen)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  country_code TEXT,                              -- ISO 3166-1 alpha-2
  primary_spoken_language TEXT DEFAULT 'en',      -- ISO 639-1
  preferred_translation_language TEXT DEFAULT 'en',
  auto_language_detection INTEGER DEFAULT 1,
  translation_mode TEXT DEFAULT 'text',           -- text | text_voice | voice
  show_original_text INTEGER DEFAULT 1,
  original_audio_volume INTEGER DEFAULT 100,      -- 0..100
  translated_audio_volume INTEGER DEFAULT 100,
  timezone TEXT DEFAULT 'UTC',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Meetings & rooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  host_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                   -- instant | private_room | scheduled
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | active | ended | cancelled
  scheduled_at DATETIME,
  started_at DATETIME,
  ended_at DATETIME,
  -- settings
  video_enabled INTEGER DEFAULT 1,
  translation_enabled INTEGER DEFAULT 1,
  allow_language_selection INTEGER DEFAULT 1,
  auto_language_detection INTEGER DEFAULT 1,
  recording_enabled INTEGER DEFAULT 0,  -- audio recording OFF by default (section 21)
  password_hash TEXT,                   -- NULL = no password
  max_participants INTEGER DEFAULT 25,
  host_language TEXT DEFAULT 'en',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON meetings(host_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- One physical room per meeting. Private client rooms are persistent and reusable.
CREATE TABLE IF NOT EXISTS meeting_rooms (
  id TEXT PRIMARY KEY,
  meeting_id TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,            -- used in /room/:slug
  livekit_room_name TEXT UNIQUE,        -- reserved for Phase 2
  is_persistent INTEGER DEFAULT 0,
  client_name TEXT,                     -- for private client rooms ("Carlos Garcia")
  client_contact_id TEXT,
  is_locked INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- Every time a room is used counts as a session (private rooms have many).
CREATE TABLE IF NOT EXISTS meeting_sessions (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  participant_count INTEGER DEFAULT 0,
  languages_used TEXT,                  -- JSON array of ISO codes
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_meeting ON meeting_sessions(meeting_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_invitations (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,           -- 160-bit URL-safe token used in /join/:token
  label TEXT,                           -- e.g. "Carlos", "Team link"
  invited_email TEXT,
  password_hash TEXT,                   -- optional link-level password
  expires_at DATETIME,                  -- NULL = never
  max_uses INTEGER,                     -- NULL = unlimited
  use_count INTEGER DEFAULT 0,
  single_use INTEGER DEFAULT 0,
  is_persistent INTEGER DEFAULT 0,      -- persistent room invitation
  is_active INTEGER DEFAULT 1,          -- host can disable
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invitations_meeting ON meeting_invitations(meeting_id);

-- ---------------------------------------------------------------------------
-- Participants & language preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  session_id TEXT,                      -- meeting_sessions.id (set when room is live)
  user_id TEXT,                         -- NULL for guests
  invitation_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant', -- host | participant
  participant_token TEXT UNIQUE NOT NULL,   -- opaque token for the guest's browser (cookie)
  -- language preferences (stored independently from country — AD-8)
  country_code TEXT,
  spoken_language TEXT NOT NULL,
  translation_language TEXT NOT NULL,
  auto_detect_language INTEGER DEFAULT 1,
  translation_mode TEXT DEFAULT 'text',     -- text | text_voice | voice
  show_original_text INTEGER DEFAULT 1,
  original_audio_volume INTEGER DEFAULT 100,
  translated_audio_volume INTEGER DEFAULT 100,
  -- presence
  status TEXT DEFAULT 'joined',             -- joined | left | removed
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (invitation_id) REFERENCES meeting_invitations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id);

-- ---------------------------------------------------------------------------
-- Transcripts & translations (metadata only in Phase 1; populated from Phase 3/4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_transcripts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  session_id TEXT,
  participant_id TEXT NOT NULL,
  detected_language TEXT NOT NULL,
  text TEXT NOT NULL,
  is_final INTEGER DEFAULT 1,
  confidence REAL,
  started_at_ms INTEGER,                -- offset from session start
  ended_at_ms INTEGER,
  provider TEXT,                        -- e.g. deepgram
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES meeting_participants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON meeting_transcripts(meeting_id, created_at);

-- One row per (transcript, target_language) — never per participant (section 4).
CREATE TABLE IF NOT EXISTS meeting_translations (
  id TEXT PRIMARY KEY,
  transcript_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  text TEXT NOT NULL,
  provider TEXT,
  cache_hit INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (transcript_id, target_language),
  FOREIGN KEY (transcript_id) REFERENCES meeting_transcripts(id) ON DELETE CASCADE,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  country_code TEXT,
  spoken_language TEXT,
  translation_language TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_user_id, name);
