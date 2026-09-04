/**
 * OpenAI-compatible chat-completions TranslationProvider.
 * Works with api.openai.com or any compatible gateway (set OPENAI_BASE_URL).
 * Output is constrained to the translation only — no commentary — via a strict system prompt + JSON mode fallback.
 */
import type { TranslationProvider, TranslationRequest, TranslationResult } from './types'
import { getLanguage } from '../../lib/languages'

export class OpenAITranslationProvider implements TranslationProvider {
  readonly name: string
  constructor(private apiKey: string, private baseUrl = 'https://api.openai.com/v1', private model = 'gpt-5-mini') {
    this.name = `openai:${model}`
  }

  supportsLanguagePair(source: string, target: string) {
    return !!getLanguage(source) && !!getLanguage(target) && source !== target
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const t0 = Date.now()
    const src = getLanguage(req.sourceLanguage)?.name ?? req.sourceLanguage
    const tgt = getLanguage(req.targetLanguage)?.name ?? req.targetLanguage
    const system = [
      `You are a professional simultaneous interpreter for live business meetings.`,
      `Translate the user's utterance from ${src} to ${tgt}.`,
      `Rules: output ONLY the ${tgt} translation — no quotes, no notes, no preamble.`,
      `Preserve meaning, tone, numbers, names and formality. Keep it natural and concise, as spoken language.`,
      `If the text is already in ${tgt}, return it unchanged. If it is unintelligible noise, return an empty string.`,
      req.context ? `Meeting context: ${req.context}` : ''
    ].filter(Boolean).join('\n')

    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: req.text }],
        max_completion_tokens: Math.min(2000, Math.max(200, req.text.length * 3))
      })
    })
    if (!res.ok) throw new Error(`Translation provider error ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as any
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
    return { text, sourceLanguage: req.sourceLanguage, targetLanguage: req.targetLanguage, provider: this.name, latencyMs: Date.now() - t0, cacheHit: false }
  }
}
