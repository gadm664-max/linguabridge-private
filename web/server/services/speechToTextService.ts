import {
  transcribeAudioBuffer,
  type TranscribeBufferOptions,
  type TranscriptionError,
  type TranscriptionResponse,
} from "../_core/voiceTranscription";
import { ENV } from "../_core/env";

export type SpeechToTextRequest = TranscribeBufferOptions & {
  context?: string;
};

export type SpeechToTextResult = TranscriptionResponse;

export interface SpeechToTextProvider {
  readonly name: string;
  readonly model: string;
  transcribeChunk(input: SpeechToTextRequest): Promise<SpeechToTextResult>;
}

export type SpeechToTextProviderFactory = () => SpeechToTextProvider;

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

export class SpeechToTextProviderConfigurationError extends Error {
  constructor(providerName: string) {
    super(`Speech-to-text provider is not configured: ${providerName}`);
    this.name = "SpeechToTextProviderConfigurationError";
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

/** Registry for replaceable STT providers (STT A/B/C in the architecture). */
export class SpeechToTextProviderRegistry {
  private readonly factories = new Map<string, SpeechToTextProviderFactory>();

  register(name: string, factory: SpeechToTextProviderFactory) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) throw new SpeechToTextProviderConfigurationError(name);
    this.factories.set(normalizedName, factory);
    return this;
  }

  resolve(name: string) {
    const normalizedName = name.trim().toLowerCase();
    const factory = this.factories.get(normalizedName);
    if (!factory)
      throw new SpeechToTextProviderConfigurationError(normalizedName);
    return factory();
  }

  resolveMany(names: string[]) {
    return names.map(name => this.resolve(name));
  }
}

/** Executes registered STT providers in configured order until one succeeds. */
export class FallbackSpeechToTextProvider implements SpeechToTextProvider {
  readonly name: string;
  readonly model = "fallback";

  constructor(private readonly providers: SpeechToTextProvider[]) {
    if (!providers.length)
      throw new SpeechToTextProviderConfigurationError("empty");
    this.name = `fallback(${providers.map(provider => provider.name).join(",")})`;
  }

  async transcribeChunk(input: SpeechToTextRequest) {
    let lastError: SpeechToTextServiceError | undefined;
    for (const provider of this.providers) {
      try {
        return await provider.transcribeChunk(input);
      } catch (error) {
        lastError =
          error instanceof SpeechToTextServiceError
            ? error
            : new SpeechToTextServiceError(
                "NETWORK_FAILURE",
                "Speech-to-text provider unavailable",
                503
              );
      }
    }
    throw (
      lastError ??
      new SpeechToTextServiceError(
        "NETWORK_FAILURE",
        "Speech-to-text provider unavailable",
        503
      )
    );
  }
}

export function parseSpeechToTextProviderOrder(value: string) {
  const names = value
    .split(",")
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(names.length ? names : ["manus-whisper"]));
}

export function createSpeechToTextProviderRegistry() {
  return new SpeechToTextProviderRegistry().register(
    "manus-whisper",
    () => new ManusWhisperSpeechToTextProvider()
  );
}

export function createConfiguredSpeechToTextProvider() {
  try {
    const registry = createSpeechToTextProviderRegistry();
    const providers = registry.resolveMany(
      parseSpeechToTextProviderOrder(ENV.speechToTextProvider)
    );
    return providers.length === 1
      ? providers[0]
      : new FallbackSpeechToTextProvider(providers);
  } catch (error) {
    if (error instanceof SpeechToTextServiceError) throw error;
    throw new SpeechToTextServiceError(
      "SERVICE_ERROR",
      "Speech-to-text provider configuration is invalid",
      500
    );
  }
}

export async function transcribeChunk(
  input: SpeechToTextRequest,
  provider?: SpeechToTextProvider
): Promise<SpeechToTextResult> {
  return (provider ?? createConfiguredSpeechToTextProvider()).transcribeChunk(
    input
  );
}

export const speechToTextLimits = {
  maxChunkBytes: 16 * 1024 * 1024,
  recommendedChunkDurationMs: 4000,
} as const;
