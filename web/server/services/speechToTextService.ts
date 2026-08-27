import {
  transcribeAudioBuffer,
  type TranscribeBufferOptions,
  type TranscriptionError,
  type TranscriptionResponse,
} from "../_core/voiceTranscription";
import { ENV } from "../_core/env";

export type SpeechRequest = TranscribeBufferOptions & {
  context?: string;
};

export type SpeechResult = TranscriptionResponse;

export interface SpeechProvider {
  readonly name: string;
  readonly model: string;
  transcribeChunk(input: SpeechRequest): Promise<SpeechResult>;
}

export type SpeechProviderFactory = () => SpeechProvider;

export class SpeechServiceError extends Error {
  constructor(
    public readonly code: TranscriptionError["code"],
    message: string,
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "SpeechServiceError";
  }
}

export class SpeechProviderConfigurationError extends Error {
  constructor(providerName: string) {
    super(`Speech provider is not configured: ${providerName}`);
    this.name = "SpeechProviderConfigurationError";
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
  return new SpeechServiceError(
    error.code,
    error.error,
    statusCode,
    error.retryAfterMs
  );
}

export class ManusWhisperSpeechProvider implements SpeechProvider {
  readonly name = "manus-whisper";
  readonly model = "whisper-1";

  async transcribeChunk(input: SpeechRequest) {
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

/** Registry for replaceable STT providers (STT A / STT B). */
export class SpeechProviderRegistry {
  private readonly factories = new Map<string, SpeechProviderFactory>();

  register(name: string, factory: SpeechProviderFactory) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) throw new SpeechProviderConfigurationError(name);
    this.factories.set(normalizedName, factory);
    return this;
  }

  resolve(name: string) {
    const normalizedName = name.trim().toLowerCase();
    const factory = this.factories.get(normalizedName);
    if (!factory) throw new SpeechProviderConfigurationError(normalizedName);
    return factory();
  }

  resolveMany(names: string[]) {
    return names.map(name => this.resolve(name));
  }
}

/** Executes registered STT providers in configured order until one succeeds. */
export class FallbackSpeechProvider implements SpeechProvider {
  readonly name: string;
  readonly model = "fallback";

  constructor(private readonly providers: SpeechProvider[]) {
    if (!providers.length) throw new SpeechProviderConfigurationError("empty");
    this.name = `fallback(${providers.map(provider => provider.name).join(",")})`;
  }

  async transcribeChunk(input: SpeechRequest) {
    let lastError: SpeechServiceError | undefined;
    for (const provider of this.providers) {
      try {
        return await provider.transcribeChunk(input);
      } catch (error) {
        lastError =
          error instanceof SpeechServiceError
            ? error
            : new SpeechServiceError(
                "NETWORK_FAILURE",
                "Speech provider unavailable",
                503
              );
      }
    }
    throw (
      lastError ??
      new SpeechServiceError(
        "NETWORK_FAILURE",
        "Speech provider unavailable",
        503
      )
    );
  }
}

export function parseSpeechProviderOrder(value: string) {
  const names = value
    .split(",")
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(names.length ? names : ["manus-whisper"]));
}

export function createSpeechProviderRegistry() {
  return new SpeechProviderRegistry().register(
    "manus-whisper",
    () => new ManusWhisperSpeechProvider()
  );
}

export function createConfiguredSpeechProvider() {
  try {
    const registry = createSpeechProviderRegistry();
    const providers = registry.resolveMany(
      parseSpeechProviderOrder(ENV.speechToTextProvider)
    );
    return providers.length === 1
      ? providers[0]
      : new FallbackSpeechProvider(providers);
  } catch (error) {
    if (error instanceof SpeechServiceError) throw error;
    throw new SpeechServiceError(
      "SERVICE_ERROR",
      "Speech provider configuration is invalid",
      500
    );
  }
}

export class SpeechService {
  constructor(
    private readonly provider: SpeechProvider = createConfiguredSpeechProvider()
  ) {}

  transcribeChunk(input: SpeechRequest) {
    return this.provider.transcribeChunk(input);
  }

  get providerName() {
    return this.provider.name;
  }

  get model() {
    return this.provider.model;
  }
}

let defaultService: SpeechService | undefined;

export function transcribeChunk(
  input: SpeechRequest,
  provider?: SpeechProvider
): Promise<SpeechResult> {
  const service = provider
    ? new SpeechService(provider)
    : (defaultService ??= new SpeechService());
  return service.transcribeChunk(input);
}

export const speechToTextLimits = {
  maxChunkBytes: 16 * 1024 * 1024,
  recommendedChunkDurationMs: 4000,
} as const;

/** Compatibility aliases for the pre-registry Phase 3A naming. */
export type SpeechToTextRequest = SpeechRequest;
export type SpeechToTextResult = SpeechResult;
export type SpeechToTextProvider = SpeechProvider;
export type SpeechToTextProviderFactory = SpeechProviderFactory;
export const SpeechToTextServiceError = SpeechServiceError;
export const SpeechToTextProviderConfigurationError =
  SpeechProviderConfigurationError;
export const ManusWhisperSpeechToTextProvider = ManusWhisperSpeechProvider;
export const SpeechToTextProviderRegistry = SpeechProviderRegistry;
export const FallbackSpeechToTextProvider = FallbackSpeechProvider;
export const parseSpeechToTextProviderOrder = parseSpeechProviderOrder;
export const createSpeechToTextProviderRegistry = createSpeechProviderRegistry;
export const createConfiguredSpeechToTextProvider =
  createConfiguredSpeechProvider;
