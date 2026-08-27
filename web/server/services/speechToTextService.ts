import {
  transcribeAudioBuffer,
  type TranscribeBufferOptions,
  type TranscriptionError,
  type TranscriptionResponse,
} from "../_core/voiceTranscription";
import { ENV } from "../_core/env";
import {
  DeepgramWebSocketTransport,
  SpeechStreamError,
  type SpeechStreamEvent,
  type SpeechStreamTransport,
} from "./speechStreamTransport";

export type SpeechRequest = TranscribeBufferOptions & {
  context?: string;
};

export type SpeechResult = TranscriptionResponse;
export type SpeechStreamingResult = {
  response: SpeechResult;
  firstPartialLatencyMs: number | null;
  finalResultLatencyMs: number | null;
};
export type SpeechProviderStreamEvent = SpeechStreamEvent;
export type SpeechProviderStream = SpeechStreamTransport;

export interface SpeechProvider {
  readonly name: string;
  readonly model: string;
  transcribeChunk(input: SpeechRequest): Promise<SpeechResult>;
  createStream?(input: SpeechRequest): Promise<SpeechProviderStream>;
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

function mapStreamError(error: SpeechStreamError) {
  return new SpeechServiceError(
    error.code,
    error.message,
    error.statusCode,
    error.retryAfterMs
  );
}

function normalizeDeepgramLanguage(language?: string) {
  const normalized = language?.trim().toLowerCase() || "en";
  if (normalized === "ar-eg") return "ar-EG";
  if (normalized === "ar") return "ar";
  if (normalized === "es-es") return "es";
  if (normalized === "es") return "es";
  if (normalized === "en-us") return "en-US";
  if (normalized === "en") return "en";
  return language?.trim() || "en";
}

function toSegment(
  event: Extract<SpeechStreamEvent, { type: "final" }>,
  index: number
) {
  return {
    id: index,
    seek: 0,
    start: event.startSeconds,
    end: event.startSeconds + event.durationSeconds,
    text: event.transcript,
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0,
  };
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

export type DeepgramSpeechProviderOptions = {
  apiKey?: string;
  transportFactory?: (
    options: ConstructorParameters<typeof DeepgramWebSocketTransport>[0]
  ) => SpeechProviderStream;
};

export class DeepgramSpeechProvider implements SpeechProvider {
  readonly name = "deepgram";
  readonly model = "nova-3";
  private readonly apiKey: string;
  private readonly transportFactory: NonNullable<
    DeepgramSpeechProviderOptions["transportFactory"]
  >;
  private readonly hasInjectedTransport: boolean;

  constructor(options: DeepgramSpeechProviderOptions = {}) {
    this.apiKey = options.apiKey ?? ENV.deepgramApiKey;
    this.hasInjectedTransport = Boolean(options.transportFactory);
    this.transportFactory =
      options.transportFactory ??
      (transportOptions => new DeepgramWebSocketTransport(transportOptions));
  }

  async createStream(input: SpeechRequest) {
    if (!this.apiKey && !this.hasInjectedTransport) {
      throw new SpeechServiceError(
        "AUTHENTICATION_FAILED",
        "Speech provider authentication is missing",
        502
      );
    }
    const transport = this.transportFactory({
      apiKey: this.apiKey,
      language: normalizeDeepgramLanguage(input.language),
      model: this.model,
      interimResults: true,
      endpointingMs: 300,
    });
    try {
      await transport.connect();
      return transport;
    } catch (error) {
      if (error instanceof SpeechStreamError) throw mapStreamError(error);
      throw new SpeechServiceError(
        "NETWORK_FAILURE",
        "Speech provider connection failed",
        503
      );
    }
  }

  async transcribeStream(input: SpeechRequest): Promise<SpeechStreamingResult> {
    let stream: SpeechProviderStream | undefined;
    const finalEvents: Array<Extract<SpeechStreamEvent, { type: "final" }>> =
      [];
    let streamError: SpeechServiceError | undefined;
    let firstPartialLatencyMs: number | null = null;
    let finalResultLatencyMs: number | null = null;
    const startedAt = performance.now();
    try {
      stream = await this.createStream(input);
      const unsubscribe = stream.onEvent(event => {
        if (event.type === "partial" && firstPartialLatencyMs === null) {
          firstPartialLatencyMs = Math.round(performance.now() - startedAt);
        }
        if (event.type === "final") {
          finalEvents.push(event);
          if (finalResultLatencyMs === null) {
            finalResultLatencyMs = Math.round(performance.now() - startedAt);
          }
        }
        if (event.type === "provider_error") {
          streamError = mapStreamError(event.error);
        }
      });
      stream.sendAudio(input.audio);
      await stream.close();
      unsubscribe();
    } catch (error) {
      if (error instanceof SpeechServiceError) throw error;
      if (error instanceof SpeechStreamError) throw mapStreamError(error);
      throw new SpeechServiceError(
        "NETWORK_FAILURE",
        "Speech provider streaming request failed",
        503
      );
    }
    if (streamError) throw streamError;
    if (!finalEvents.length) {
      throw new SpeechServiceError(
        "MALFORMED_RESPONSE",
        "Speech provider returned no final transcript",
        502
      );
    }
    const text = finalEvents
      .map(event => event.transcript)
      .join(" ")
      .trim();
    const duration = finalEvents.reduce(
      (latest, event) =>
        Math.max(latest, event.startSeconds + event.durationSeconds),
      0
    );
    return {
      response: {
        task: "transcribe" as const,
        language: normalizeDeepgramLanguage(input.language),
        duration,
        text,
        segments: finalEvents.map(toSegment),
      },
      firstPartialLatencyMs,
      finalResultLatencyMs,
    };
  }

  async transcribeChunk(input: SpeechRequest) {
    const { response } = await this.transcribeStream(input);
    return response;
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
  return Array.from(new Set(names.length ? names : ["deepgram"]));
}

export function createSpeechProviderRegistry() {
  return new SpeechProviderRegistry()
    .register("deepgram", () => new DeepgramSpeechProvider())
    .register("manus-whisper", () => new ManusWhisperSpeechProvider());
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

  createStream(input: SpeechRequest) {
    if (!this.provider.createStream) {
      return Promise.reject(
        new SpeechServiceError(
          "SERVICE_ERROR",
          "Speech provider does not support streaming",
          501
        )
      );
    }
    return this.provider.createStream(input);
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
