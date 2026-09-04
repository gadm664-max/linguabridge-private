/**
 * SpeechToTextProvider abstraction (section 16). Deepgram planned for Phase 3.
 * The API key never leaves the server; the browser only ever receives a short-lived token
 * or talks to a server-side relay.
 */
export interface SttSessionOptions {
  /** ISO 639-1 or 'auto' for automatic language detection. */
  language: string | 'auto'
  sampleRate: number
  encoding: 'linear16' | 'opus' | 'webm'
  interimResults: boolean
}

export interface SttTranscript {
  segmentId: string
  text: string
  isFinal: boolean
  detectedLanguage: string
  confidence?: number
  startMs?: number
  endMs?: number
}

export interface SpeechToTextProvider {
  readonly name: string
  readonly supportedLanguages: string[]
  readonly supportsAutoDetect: boolean
  /** Issue a short-lived, scoped credential the browser can use to open a streaming session. */
  createEphemeralToken?(ttlSeconds: number): Promise<{ token: string; expiresAt: number; wsUrl: string }>
}
