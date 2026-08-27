import {
  transcribeAudioBuffer,
  type TranscribeBufferOptions,
  type TranscriptionError,
  type TranscriptionResponse,
} from "../_core/voiceTranscription";

export type SpeechToTextRequest = TranscribeBufferOptions & {
  context?: string;
};

export type SpeechToTextResult = TranscriptionResponse;

export interface SpeechToTextProvider {
  readonly name: string;
  readonly model: string;
  transcribeChunk(input: SpeechToTextRequest): Promise<SpeechToTextResult>;
}

export class SpeechToTextServiceError extends Error {
  constructor(
    public readonly code: TranscriptionError["code"],
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "SpeechToTextServiceError";
  }
}

function mapError(error: TranscriptionError) {
  const statusCode =
    error.code === "FILE_TOO_LARGE"
      ? 413
      : error.code === "INVALID_FORMAT"
        ? 400
        : error.code === "AUTHENTICATION_FAILED"
          ? 502
          : error.code === "RATE_LIMITED"
            ? 429
            : error.code === "TIMEOUT"
              ? 504
              : error.code === "NETWORK_FAILURE"
                ? 503
                : 502;
  return new SpeechToTextServiceError(
    error.code,
    error.error,
    statusCode,
    error.retryAfterMs
  );
}

export class ManusWhisperSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "manus-whisper";
  readonly model = "whisper-1";

  async transcribeChunk(input: SpeechToTextRequest) {
    const result = await transcribeAudioBuffer({
      audio: input.audio,
      mimeType: input.mimeType,
      language: input.language,
      prompt: input.prompt ?? input.context,
    });
    if ("error" in result) throw mapError(result);
    return result;
  }
}

let defaultProvider: SpeechToTextProvider | undefined;

export function createSpeechToTextProvider(): SpeechToTextProvider {
  return new ManusWhisperSpeechToTextProvider();
}

function getDefaultProvider() {
  return (defaultProvider ??= createSpeechToTextProvider());
}

export async function transcribeChunk(
  input: SpeechToTextRequest,
  provider: SpeechToTextProvider = getDefaultProvider()
): Promise<SpeechToTextResult> {
  return provider.transcribeChunk(input);
}

export const speechToTextLimits = {
  maxChunkBytes: 16 * 1024 * 1024,
  recommendedChunkDurationMs: 4000,
} as const;
