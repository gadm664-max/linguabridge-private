/**
 * TextToSpeechProvider factory (section 18).
 *   TTS_PROVIDER=openai      → OpenAI /v1/audio/speech (key: TTS_API_KEY or OPENAI_API_KEY; base: TTS_BASE_URL or OPENAI_BASE_URL)
 *   TTS_PROVIDER=elevenlabs  → ElevenLabs /v1/text-to-speech (key: TTS_API_KEY)
 * Audio never touches disk; it streams from the provider through the Worker to the browser.
 */
import type { ProviderStatus } from '../translation/types'
import type { Bindings } from '../../types'
import type { TextToSpeechProvider, TtsRequest, TtsResult } from './types'

export function ttsProviderStatus(env: Bindings): ProviderStatus {
  const name = (env.TTS_PROVIDER || '').toLowerCase()
  if (!name) return { configured: false, reason: 'TTS_PROVIDER not set (openai | elevenlabs)', requiredEnv: ['TTS_PROVIDER', 'TTS_API_KEY'] }
  if (name === 'openai') {
    if (!(env.TTS_API_KEY || env.OPENAI_API_KEY)) return { configured: false, reason: 'TTS_API_KEY / OPENAI_API_KEY not set', requiredEnv: ['TTS_API_KEY'] }
    return { configured: true, provider: `openai:${env.TTS_MODEL || 'gpt-4o-mini-tts'}` }
  }
  if (name === 'elevenlabs') {
    if (!env.TTS_API_KEY) return { configured: false, reason: 'TTS_API_KEY not set', requiredEnv: ['TTS_API_KEY'] }
    return { configured: true, provider: `elevenlabs:${env.TTS_MODEL || 'eleven_flash_v2_5'}` }
  }
  return { configured: false, reason: `Unknown TTS_PROVIDER "${name}"`, requiredEnv: ['TTS_PROVIDER'] }
}

class OpenAITts implements TextToSpeechProvider {
  readonly name: string
  constructor(private key: string, private base: string, private model: string) { this.name = `openai:${model}` }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const res = await fetch(`${this.base.replace(/\/$/, '')}/audio/speech`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: req.text, voice: req.voice || 'alloy', response_format: 'mp3', speed: req.speed ?? 1 })
    })
    if (!res.ok || !res.body) throw new Error(`OpenAI TTS error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return { audio: res.body, mimeType: 'audio/mpeg', provider: this.name }
  }
  async listVoices() {
    return ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map((id) => ({ id, name: id }))
  }
}

class ElevenLabsTts implements TextToSpeechProvider {
  readonly name: string
  constructor(private key: string, private model: string) { this.name = `elevenlabs:${model}` }
  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const voice = req.voice || 'JBFqnCBsd6RMkjVDRZzb' // "George" — multilingual default
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: req.text, model_id: this.model, language_code: req.language })
    })
    if (!res.ok || !res.body) throw new Error(`ElevenLabs TTS error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return { audio: res.body, mimeType: 'audio/mpeg', provider: this.name }
  }
  async listVoices() {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': this.key } })
    if (!res.ok) return []
    const data = (await res.json()) as any
    return (data.voices ?? []).map((v: any) => ({ id: v.voice_id, name: v.name, gender: v.labels?.gender }))
  }
}

export function getTtsProvider(env: Bindings): TextToSpeechProvider | null {
  const status = ttsProviderStatus(env)
  if (!status.configured) return null
  const name = env.TTS_PROVIDER!.toLowerCase()
  if (name === 'openai') return new OpenAITts(env.TTS_API_KEY || env.OPENAI_API_KEY!, env.TTS_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1', env.TTS_MODEL || 'gpt-4o-mini-tts')
  return new ElevenLabsTts(env.TTS_API_KEY!, env.TTS_MODEL || 'eleven_flash_v2_5')
}
