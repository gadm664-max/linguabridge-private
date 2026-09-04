/**
 * Tiny dependency-free validation helpers. Every API input passes through these.
 */
import { isSupportedLanguage, TRANSLATION_MODES } from './languages'
import { isSupportedCountry } from './countries'
import type { LanguagePreferences, TranslationMode } from '../types'

export class ValidationError extends Error {
  status = 400
  constructor(public field: string, message: string) {
    super(message)
  }
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return ''
    throw new ValidationError(field, `${field} is required`)
  }
  if (typeof v !== 'string') throw new ValidationError(field, `${field} must be a string`)
  const t = v.trim()
  if (opts.min !== undefined && t.length < opts.min) throw new ValidationError(field, `${field} must be at least ${opts.min} characters`)
  if (opts.max !== undefined && t.length > opts.max) throw new ValidationError(field, `${field} must be at most ${opts.max} characters`)
  return t
}

export function email(v: unknown): string {
  const s = str(v, 'email', { max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError('email', 'Invalid email address')
  return s
}

export function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1' || v === 'true' || v === 'on') return true
  if (v === 0 || v === '0' || v === 'false' || v === 'off') return false
  throw new ValidationError('boolean', 'Invalid boolean value')
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number; fallback?: number }): number {
  if (v === undefined || v === null || v === '') {
    if (opts.fallback !== undefined) return opts.fallback
    throw new ValidationError(field, `${field} is required`)
  }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n)) throw new ValidationError(field, `${field} must be an integer`)
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(field, `${field} must be >= ${opts.min}`)
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(field, `${field} must be <= ${opts.max}`)
  return n
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[], fallback?: T): T {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new ValidationError(field, `${field} must be one of: ${allowed.join(', ')}`)
  return v as T
}

export function language(v: unknown, field: string, fallback?: string): string {
  if ((v === undefined || v === null || v === '') && fallback) return fallback
  if (!isSupportedLanguage(v)) throw new ValidationError(field, `${field} is not a supported language`)
  return v
}

export function country(v: unknown, field = 'country_code'): string | null {
  if (v === undefined || v === null || v === '') return null
  if (!isSupportedCountry(v)) throw new ValidationError(field, `${field} is not a supported country`)
  return v
}

/** Parses the participant language preference block (section 14). */
export function languagePreferences(body: Record<string, unknown>, defaults?: Partial<LanguagePreferences>): LanguagePreferences {
  const spoken = language(body.spoken_language, 'spoken_language', defaults?.spoken_language)
  return {
    country_code: country(body.country_code) ?? defaults?.country_code ?? null,
    spoken_language: spoken,
    translation_language: language(body.translation_language, 'translation_language', defaults?.translation_language ?? spoken),
    auto_detect_language: bool(body.auto_detect_language, defaults?.auto_detect_language ?? true),
    translation_mode: oneOf<TranslationMode>(body.translation_mode, 'translation_mode', TRANSLATION_MODES, defaults?.translation_mode ?? 'text'),
    show_original_text: bool(body.show_original_text, defaults?.show_original_text ?? true),
    original_audio_volume: int(body.original_audio_volume, 'original_audio_volume', { min: 0, max: 100, fallback: defaults?.original_audio_volume ?? 100 }),
    translated_audio_volume: int(body.translated_audio_volume, 'translated_audio_volume', { min: 0, max: 100, fallback: defaults?.translated_audio_volume ?? 100 })
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      const j = await req.json()
      return j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
    }
    if (ct.includes('form')) {
      const fd = await req.formData()
      const out: Record<string, unknown> = {}
      fd.forEach((v, k) => (out[k] = typeof v === 'string' ? v : undefined))
      return out
    }
  } catch {
    throw new ValidationError('body', 'Malformed request body')
  }
  return {}
}
