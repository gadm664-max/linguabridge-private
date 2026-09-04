/**
 * TextToSpeechProvider abstraction (section 18). Implemented in Phase 6.
 */
export interface TtsRequest {
  text: string
  language: string // ISO 639-1
  voice?: string
  speed?: number
}

export interface TtsResult {
  audio: ReadableStream<Uint8Array> | ArrayBuffer
  mimeType: string
  durationMs?: number
  provider: string
}

export interface TextToSpeechProvider {
  readonly name: string
  synthesize(req: TtsRequest): Promise<TtsResult>
  listVoices(language: string): Promise<Array<{ id: string; name: string; gender?: string }>>
}
