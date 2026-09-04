/**
 * Supported languages (section 15). Adding a language = adding one entry here.
 * `priority` languages (ar/en/es) are surfaced first in the UI.
 * `deepgramModel`/`bcp47` are metadata for later phases; no provider calls happen here.
 */
export interface LanguageDef {
  code: string // ISO 639-1
  name: string // English name
  nativeName: string
  bcp47: string // default locale used for STT/TTS
  rtl: boolean
  priority: boolean
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', bcp47: 'ar', rtl: true, priority: true },
  { code: 'en', name: 'English', nativeName: 'English', bcp47: 'en-US', rtl: false, priority: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', bcp47: 'es', rtl: false, priority: true },
  { code: 'fr', name: 'French', nativeName: 'Français', bcp47: 'fr', rtl: false, priority: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', bcp47: 'it', rtl: false, priority: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', bcp47: 'pt', rtl: false, priority: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', bcp47: 'de', rtl: false, priority: false }
]

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code)

export function isSupportedLanguage(code: unknown): code is string {
  return typeof code === 'string' && LANGUAGE_CODES.includes(code)
}

export function getLanguage(code: string): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.code === code)
}

export const TRANSLATION_MODES = ['text', 'text_voice', 'voice'] as const
