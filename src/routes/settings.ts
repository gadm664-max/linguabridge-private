import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireAuthApi } from '../lib/auth'
import { one, run } from '../lib/db'
import { readBody, str, languagePreferences } from '../lib/validation'
import { LANGUAGES } from '../lib/languages'
import { COUNTRIES } from '../lib/countries'
import { translationProviderStatus } from '../providers/translation'
import { sttProviderStatus } from '../providers/stt'
import { ttsProviderStatus } from '../providers/tts'
import { realtimeProviderStatus } from '../providers/realtime'

const settings = new Hono<AppEnv>()

// Public reference data (no auth needed — used by join screen too)
settings.get('/reference', (c) => c.json({ languages: LANGUAGES, countries: COUNTRIES }))

settings.use('/me', requireAuthApi)
settings.use('/providers', requireAuthApi)

settings.get('/me', async (c) => {
  return c.json({ settings: await one(c.env.DB, 'SELECT * FROM user_settings WHERE user_id = ?', c.var.user!.id) })
})

settings.put('/me', async (c) => {
  const body = await readBody(c.req.raw)
  const cur = await one<any>(c.env.DB, 'SELECT * FROM user_settings WHERE user_id = ?', c.var.user!.id)
  const p = languagePreferences(body, {
    country_code: cur?.country_code ?? null,
    spoken_language: cur?.primary_spoken_language ?? 'en',
    translation_language: cur?.preferred_translation_language ?? 'en',
    auto_detect_language: !!(cur?.auto_language_detection ?? 1),
    translation_mode: cur?.translation_mode ?? 'text',
    show_original_text: !!(cur?.show_original_text ?? 1),
    original_audio_volume: cur?.original_audio_volume ?? 100,
    translated_audio_volume: cur?.translated_audio_volume ?? 100
  })
  const timezone = str(body.timezone, 'timezone', { max: 64, optional: true }) || cur?.timezone || 'UTC'
  await run(
    c.env.DB,
    `INSERT INTO user_settings (user_id, country_code, primary_spoken_language, preferred_translation_language, auto_language_detection, translation_mode,
        show_original_text, original_audio_volume, translated_audio_volume, timezone, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET country_code = excluded.country_code, primary_spoken_language = excluded.primary_spoken_language,
        preferred_translation_language = excluded.preferred_translation_language, auto_language_detection = excluded.auto_language_detection,
        translation_mode = excluded.translation_mode, show_original_text = excluded.show_original_text,
        original_audio_volume = excluded.original_audio_volume, translated_audio_volume = excluded.translated_audio_volume,
        timezone = excluded.timezone, updated_at = CURRENT_TIMESTAMP`,
    c.var.user!.id, p.country_code, p.spoken_language, p.translation_language, p.auto_detect_language ? 1 : 0, p.translation_mode,
    p.show_original_text ? 1 : 0, p.original_audio_volume, p.translated_audio_volume, timezone
  )
  // Profile fields
  if (body.name !== undefined || body.company !== undefined) {
    const name = body.name !== undefined ? str(body.name, 'name', { min: 2, max: 80 }) : c.var.user!.name
    const company = body.company !== undefined ? str(body.company, 'company', { max: 120, optional: true }) || null : c.var.user!.company
    await run(c.env.DB, 'UPDATE users SET name = ?, company = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', name, company, c.var.user!.id)
  }
  return c.json({ settings: await one(c.env.DB, 'SELECT * FROM user_settings WHERE user_id = ?', c.var.user!.id) })
})

/** Honest capability report: which external services are configured. Never leaks key values. */
settings.get('/providers', (c) => {
  return c.json({
    realtime_media: realtimeProviderStatus(c.env),
    speech_to_text: sttProviderStatus(c.env),
    translation: translationProviderStatus(c.env),
    text_to_speech: ttsProviderStatus(c.env)
  })
})

export default settings
