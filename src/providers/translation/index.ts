/**
 * TranslationProvider factory + cache (section 17).
 * Selection: TRANSLATION_PROVIDER = "gemini" (default when GEMINI_API_KEY is present).
 *
 * Caching strategy (section 4 — translate once per target language, never per participant):
 *   L1: per-isolate in-memory LRU keyed by sha256(source|target|normalized text)
 *   L2: D1 `translation_cache` table shared by all isolates / meetings
 */
import type { ProviderStatus, TranslationProvider, TranslationRequest, TranslationResult } from './types'
import type { Bindings } from '../../types'
import { GeminiTranslationProvider } from './gemini'
import { OpenAITranslationProvider } from './openai'
import { sha256Hex } from '../../lib/crypto'

export function translationProviderStatus(env: Bindings): ProviderStatus {
  const name = (env.TRANSLATION_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : env.OPENAI_API_KEY ? 'openai' : '')).toLowerCase()
  if (!name) return { configured: false, reason: 'TRANSLATION_PROVIDER / GEMINI_API_KEY not set', requiredEnv: ['TRANSLATION_PROVIDER', 'GEMINI_API_KEY'] }
  if (name === 'gemini') {
    if (!env.GEMINI_API_KEY) return { configured: false, reason: 'GEMINI_API_KEY not set', requiredEnv: ['GEMINI_API_KEY'] }
    return { configured: true, provider: `gemini:${env.GEMINI_MODEL || 'gemini-2.5-flash'}` }
  }
  if (name === 'openai') {
    if (!env.OPENAI_API_KEY) return { configured: false, reason: 'OPENAI_API_KEY not set', requiredEnv: ['OPENAI_API_KEY'] }
    return { configured: true, provider: `openai:${env.OPENAI_MODEL || 'gpt-5-mini'}` }
  }
  return { configured: false, reason: `Unknown TRANSLATION_PROVIDER "${name}" (supported: gemini, openai)`, requiredEnv: ['TRANSLATION_PROVIDER'] }
}

export function getTranslationProvider(env: Bindings): TranslationProvider | null {
  const status = translationProviderStatus(env)
  if (!status.configured) return null
  if (status.provider.startsWith('gemini:')) {
    return new GeminiTranslationProvider(env.GEMINI_API_KEY!, env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta', env.GEMINI_MODEL || 'gemini-2.5-flash')
  }
  return new OpenAITranslationProvider(env.OPENAI_API_KEY!, env.OPENAI_BASE_URL || 'https://api.openai.com/v1', env.OPENAI_MODEL || 'gpt-5-mini')
}

// ---- L1 cache -------------------------------------------------------------
const L1_MAX = 500
const l1 = new Map<string, string>()
function l1Get(k: string) { const v = l1.get(k); if (v !== undefined) { l1.delete(k); l1.set(k, v) } return v }
function l1Set(k: string, v: string) { if (l1.size >= L1_MAX) l1.delete(l1.keys().next().value!); l1.set(k, v) }

export function normalizeForCache(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function cacheKey(source: string, target: string, text: string) {
  return sha256Hex(`${source}|${target}|${normalizeForCache(text)}`)
}

/** Translate with L1 → L2 → provider fallthrough. Persists new results to L2. */
export async function translateCached(env: Bindings, provider: TranslationProvider, req: TranslationRequest): Promise<TranslationResult> {
  const t0 = Date.now()
  const key = await cacheKey(req.sourceLanguage, req.targetLanguage, req.text)
  const hit1 = l1Get(key)
  if (hit1 !== undefined) return { text: hit1, sourceLanguage: req.sourceLanguage, targetLanguage: req.targetLanguage, provider: 'cache:l1', latencyMs: Date.now() - t0, cacheHit: true }

  const hit2 = await env.DB.prepare('SELECT translated_text, provider FROM translation_cache WHERE cache_key = ?').bind(key).first<{ translated_text: string; provider: string }>()
  if (hit2) {
    l1Set(key, hit2.translated_text)
    env.DB.prepare('UPDATE translation_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE cache_key = ?').bind(key).run().catch(() => {})
    return { text: hit2.translated_text, sourceLanguage: req.sourceLanguage, targetLanguage: req.targetLanguage, provider: `cache:l2(${hit2.provider})`, latencyMs: Date.now() - t0, cacheHit: true }
  }

  const result = await provider.translate(req)
  if (result.text) {
    l1Set(key, result.text)
    await env.DB.prepare(
      `INSERT INTO translation_cache (cache_key, source_language, target_language, source_text, translated_text, provider) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP`
    ).bind(key, req.sourceLanguage, req.targetLanguage, req.text.slice(0, 2000), result.text, result.provider).run().catch(() => {})
  }
  return result
}
