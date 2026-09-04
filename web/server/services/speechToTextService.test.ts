import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudioBuffer } from "../_core/voiceTranscription";
import { DeterministicSpeechToTextProvider } from "../testUtils/deterministicSpeechToTextProvider";
import {
  DeepgramSpeechProvider,
  FallbackSpeechProvider,
  ManusWhisperSpeechProvider,
  SpeechProviderConfigurationError,
  SpeechProviderRegistry,
  SpeechProviderStream,
  type SpeechProviderStreamEvent,
  SpeechServiceError,
  parseSpeechProviderOrder,
} from "./speechToTextService";

vi.mock("../_core/voiceTranscription", () => ({
  transcribeAudioBuffer: vi.fn(),
}));

describe("ManusWhisperSpeechProvider", () => {
  const provider = new ManusWhisperSpeechProvider();

  beforeEach(() => vi.resetAllMocks());

  it("returns the validated Whisper response", async () => {
    vi.mocked(transcribeAudioBuffer).mockResolvedValue({
      task: "transcribe",
      language: "ar",
      duration: 2,
      text: "نص الاختبار",
      segments: [],
    });

    await expect(
      provider.transcribeChunk({
        audio: Buffer.from([1]),
        mimeType: "audio/webm",
        language: "ar",
        context: "meeting",
      })
    ).resolves.toMatchObject({ text: "نص الاختبار", language: "ar" });
    expect(transcribeAudioBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: Buffer.from([1]),
        mimeType: "audio/webm",
        language: "ar",
        prompt: "meeting",
      })
    );
  });

  it.each([
    ["FILE_TOO_LARGE", 413],
    ["TIMEOUT", 504],
    ["NETWORK_FAILURE", 503],
    ["MALFORMED_RESPONSE", 502],
  ] as const)("maps %s to a safe service error", async (code, statusCode) => {
    vi.mocked(transcribeAudioBuffer).mockResolvedValue({
      error: "Safe provider message",
      code,
    });

    await expect(
      provider.transcribeChunk({
        audio: Buffer.from([1]),
        mimeType: "audio/webm",
      })
    ).rejects.toMatchObject({
      code,
      statusCode,
      message: "Safe provider message",
    });
  });

  it("preserves Retry-After metadata for rate limiting", async () => {
    vi.mocked(transcribeAudioBuffer).mockResolvedValue({
      error: "Please retry later",
      code: "RATE_LIMITED",
      retryAfterMs: 3000,
    });

    try {
      await provider.transcribeChunk({
        audio: Buffer.from([1]),
        mimeType: "audio/webm",
      });
      throw new Error("expected provider to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SpeechServiceError);
      expect(error).toMatchObject({
        code: "RATE_LIMITED",
        statusCode: 429,
        retryAfterMs: 3000,
      });
    }
  });
});

describe("SpeechToTextProviderRegistry and fallback chain", () => {
  const request = { audio: Buffer.from([1]), mimeType: "audio/webm" };
  const response = {
    task: "transcribe" as const,
    language: "en",
    duration: 1,
    text: "hello",
    segments: [],
  };

  it("normalizes provider names and preserves configured order without duplicates", () => {
    const registry = new SpeechProviderRegistry();
    const providerA = {
      name: "stt-a",
      model: "a-model",
      transcribeChunk: vi.fn(),
    };
    const providerB = {
      name: "stt-b",
      model: "b-model",
      transcribeChunk: vi.fn(),
    };
    registry
      .register("STT-A", () => providerA)
      .register("stt-b", () => providerB);

    expect(
      registry.resolveMany(parseSpeechProviderOrder("STT-A, stt-b, stt-a"))
    ).toEqual([providerA, providerB]);
  });

  it("uses the deterministic test provider without network access", async () => {
    const deterministicProvider = new DeterministicSpeechToTextProvider(
      response
    );
    await expect(
      deterministicProvider.transcribeChunk(request)
    ).resolves.toEqual(response);
    expect(deterministicProvider.name).toBe("deterministic-test-stt");
  });

  it("falls back from STT A to STT B and returns the successful transcript", async () => {
    const providerA = {
      name: "stt-a",
      model: "a-model",
      transcribeChunk: vi
        .fn()
        .mockRejectedValue(
          new SpeechServiceError("NETWORK_FAILURE", "safe failure", 503)
        ),
    };
    const providerB = {
      name: "stt-b",
      model: "b-model",
      transcribeChunk: vi.fn().mockResolvedValue(response),
    };

    await expect(
      new FallbackSpeechProvider([providerA, providerB]).transcribeChunk(
        request
      )
    ).resolves.toEqual(response);
    expect(providerA.transcribeChunk).toHaveBeenCalledWith(request);
    expect(providerB.transcribeChunk).toHaveBeenCalledWith(request);
  });

  it("returns the final structured error when all STT providers fail", async () => {
    const providerA = {
      name: "stt-a",
      model: "a-model",
      transcribeChunk: vi
        .fn()
        .mockRejectedValue(new SpeechServiceError("TIMEOUT", "timeout", 504)),
    };
    const providerB = {
      name: "stt-b",
      model: "b-model",
      transcribeChunk: vi
        .fn()
        .mockRejectedValue(
          new SpeechServiceError("RATE_LIMITED", "rate limited", 429, 2000)
        ),
    };

    await expect(
      new FallbackSpeechProvider([providerA, providerB]).transcribeChunk(
        request
      )
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429,
      retryAfterMs: 2000,
    });
  });

  it("fails closed for an unregistered configured STT provider", () => {
    const registry = new SpeechProviderRegistry();
    expect(() => registry.resolve("stt-c")).toThrow(
      SpeechProviderConfigurationError
    );
  });
});

describe("DeepgramSpeechProvider streaming adapter", () => {
  it("adapts partial and final events without requiring an API key in tests", async () => {
    const listeners = new Set<(event: SpeechProviderStreamEvent) => void>();
    const transport: SpeechProviderStream = {
      connect: vi.fn().mockResolvedValue(undefined),
      sendAudio: vi.fn(() => {
        for (const listener of listeners) {
          listener({
            type: "partial",
            transcript: "hello",
            startSeconds: 0,
            durationSeconds: 0.4,
            rawType: "Results",
          });
          listener({
            type: "final",
            transcript: "hello world",
            startSeconds: 0,
            durationSeconds: 1,
            rawType: "Results",
          });
        }
      }),
      close: vi.fn().mockResolvedValue(undefined),
      reconnect: vi.fn().mockResolvedValue(undefined),
      onEvent: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const provider = new DeepgramSpeechProvider({
      transportFactory: () => transport,
    });

    const result = await provider.transcribeStream({
      audio: Buffer.from([1, 2, 3]),
      mimeType: "audio/webm",
      language: "en-US",
    });

    expect(result.response).toMatchObject({
      language: "en-US",
      duration: 1,
      text: "hello world",
    });
    expect(result.firstPartialLatencyMs).toEqual(expect.any(Number));
    expect(result.finalResultLatencyMs).toEqual(expect.any(Number));
    expect(transport.connect).toHaveBeenCalledOnce();
    expect(transport.sendAudio).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(transport.close).toHaveBeenCalledOnce();
  });
});
