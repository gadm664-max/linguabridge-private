-- Phase 2–6: realtime media, STT, translation cache, TTS cache
-- ---------------------------------------------------------------------------

-- Shared translation cache (L2). One row per (source, target, normalized text).
-- Meetings reuse translations across sessions → "translate once per language" (section 4).
CREATE TABLE IF NOT EXISTS translation_cache (
  cache_key TEXT PRIMARY KEY,           -- sha256(source|target|normalized text)
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT,
  hit_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tcache_pair ON translation_cache(source_language, target_language);

-- Transcript segments may be upserted while partial → allow non-final rows to be replaced.
-- (meeting_transcripts already exists; add a client-generated segment id for idempotent upserts.)
ALTER TABLE meeting_transcripts ADD COLUMN segment_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_segment ON meeting_transcripts(meeting_id, segment_id);

-- Per-participant media state (mirrors LiveKit presence for history/analytics; source of truth is LiveKit while live).
ALTER TABLE meeting_participants ADD COLUMN mic_enabled INTEGER DEFAULT 0;
ALTER TABLE meeting_participants ADD COLUMN camera_enabled INTEGER DEFAULT 0;
ALTER TABLE meeting_participants ADD COLUMN livekit_identity TEXT;
ALTER TABLE meeting_participants ADD COLUMN last_seen_at DATETIME;

-- Usage metering per meeting (for analytics / billing later).
CREATE TABLE IF NOT EXISTS meeting_usage (
  meeting_id TEXT PRIMARY KEY,
  transcript_segments INTEGER DEFAULT 0,
  transcript_chars INTEGER DEFAULT 0,
  translations INTEGER DEFAULT 0,
  translation_cache_hits INTEGER DEFAULT 0,
  tts_requests INTEGER DEFAULT 0,
  tts_chars INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
