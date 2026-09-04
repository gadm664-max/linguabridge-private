/**
 * TranslationProvider abstraction (section 17).
 * Concrete providers are added in Phase 4 and selected via TRANSLATION_PROVIDER env var.
 * NO provider is implemented in Phase 1 — `getTranslationProvider()` reports "not configured".
 */
export interface TranslationRequest {
  text: string
  sourceLanguage: string // ISO 639-1
  targetLanguage: string // ISO 639-1
  /** Hint for LLM-based providers (domain, formality). */
  context?: string
}

export interface TranslationResult {
  text: string
  sourceLanguage: string
  targetLanguage: string
  provider: string
  latencyMs: number
  cacheHit: boolean
}

export interface TranslationProvider {
  readonly name: string
  translate(req: TranslationRequest): Promise<TranslationResult>
  /** Optional incremental translation; yields growing partial output. */
  translateStream?(req: TranslationRequest): AsyncIterable<string>
  supportsLanguagePair(source: string, target: string): boolean
}

export type ProviderStatus =
  | { configured: true; provider: string }
  | { configured: false; reason: string; requiredEnv: string[] }
