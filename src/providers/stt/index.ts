/**
 * SpeechToTextProvider factory — Deepgram (Nova-3) streaming.
 *
 * Security model: the browser opens the WebSocket to Deepgram directly (lowest latency, and a
 * Cloudflare Worker cannot hold a long-lived relay socket), but it NEVER receives the API key.
 * Instead the Worker exchanges DEEPGRAM_API_KEY for a short-lived scoped JWT via
 * `POST https://api.deepgram.com/v1/auth/grant` (usage::write only, ≤ 1 h TTL).
 */
import type { ProviderStatus } from '../translation/types'
import type { Bindings } from '../../types'
import type { SpeechToTextProvider } from './types'
import { LANGUAGES } from '../../lib/languages'

export function sttProviderStatus(env: Bindings): ProviderStatus {
  if (!env.DEEPGRAM_API_KEY) {
    return { configured: false, reason: 'DEEPGRAM_API_KEY not set', requiredEnv: ['DEEPGRAM_API_KEY'] }
  }
  return { configured: true, provider: 'deepgram' }
}

export class DeepgramProvider implements SpeechToTextProvider {
  readonly name = 'deepgram'
  readonly supportedLanguages = LANGUAGES.map((l) => l.code)
  readonly supportsAutoDetect = true // nova-3 `language=multi` (code-switching) for supported languages

  constructor(private apiKey: string) {}

  async createEphemeralToken(ttlSeconds = 300) {
    const ttl = Math.min(Math.max(ttlSeconds, 30), 3600)
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: ttl })
    })
    if (!res.ok) throw new Error(`Deepgram grant failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { access_token: string; expires_in?: number }
    return { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? ttl) * 1000, wsUrl: 'wss://api.deepgram.com/v1/listen' }
  }

  /**
   * Streaming parameters the browser must use. Kept server-side so language/model policy is one place.
   * `language=multi` enables auto-detection/code-switching on nova-3 (supports en, es, fr, de, it, pt, ...).
   */
  static listenParams(language: string | 'auto', sampleRate: number) {
    const p = new URLSearchParams({
      model: 'nova-3',
      language: language === 'auto' ? 'multi' : language,
      encoding: 'linear16',
      sample_rate: String(sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: '300',
      utterance_end_ms: '1200',
      vad_events: 'true'
    })
    return p.toString()
  }
}

export function getSttProvider(env: Bindings): DeepgramProvider | null {
  return env.DEEPGRAM_API_KEY ? new DeepgramProvider(env.DEEPGRAM_API_KEY) : null
}
