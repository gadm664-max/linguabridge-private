import type { TranslationProvider, TranslationRequest, TranslationResult } from './types'
import { getLanguage } from '../../lib/languages'

export class GeminiTranslationProvider implements TranslationProvider {
  readonly name: string

  constructor(private apiKey: string, private baseUrl = 'https://generativelanguage.googleapis.com/v1beta', private model = 'gemini-2.5-flash') {
    this.name = `gemini:${model}`
  }

  supportsLanguagePair(source: string, target: string) {
    return !!getLanguage(source) && !!getLanguage(target) && source !== target
  }

  async translate(req: TranslationRequest): Promise<TranslationResult> {
    const t0 = Date.now()
    const src = getLanguage(req.sourceLanguage)?.name ?? req.sourceLanguage
    const tgt = getLanguage(req.targetLanguage)?.name ?? req.targetLanguage
    const prompt = [
      'You are a professional simultaneous interpreter for live business meetings.',
      `Translate the following utterance from ${src} to ${tgt}.`,
      `Output ONLY the ${tgt} translation. Do not add quotes, notes, explanations, or a preamble.`,
      'Preserve meaning, tone, numbers, names, and formality. Keep it natural and concise as spoken language.',
      `If the text is already in ${tgt}, return it unchanged. If it is unintelligible noise, return an empty string.`,
      req.context ? `Meeting context: ${req.context}` : '',
      `Utterance:\n${req.text}`
    ].filter(Boolean).join('\n')

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: Math.min(2000, Math.max(200, req.text.length * 3)) }
      })
    })
    if (!res.ok) throw new Error(`Translation provider error ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as any
    const text = String(data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? '').join('') ?? '').trim()
    return { text, sourceLanguage: req.sourceLanguage, targetLanguage: req.targetLanguage, provider: this.name, latencyMs: Date.now() - t0, cacheHit: false }
  }
}
