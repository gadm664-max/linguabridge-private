import { describe, expect, it, vi } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import {
  SpeechServiceError,
  transcribeChunk,
} from "../services/speechToTextService";
import { translateMeetingText } from "../services/translationService";

vi.mock("../db", () => ({
  getMeetingForInvite: vi.fn(async () => ({
    id: 42,
    inviteCode: "ABCD2345",
    status: "live",
  })),
  isActiveMeetingParticipant: vi.fn(async () => true),
  isMeetingPersistenceAllowed: vi.fn(async () => true),
}));
vi.mock("../services/speechToTextService", () => ({
  SpeechServiceError: class SpeechServiceError extends Error {},
  transcribeChunk: vi.fn(),
}));
vi.mock("../services/translationService", () => ({
  TranslationServiceError: class TranslationServiceError extends Error {},
  translateMeetingText: vi.fn(),
}));

const user = {
  id: 21,
  openId: "phase3a-user",
  name: "Phase 3A User",
  email: "phase3a@example.com",
  role: "user" as const,
  loginMethod: "password",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createContext() {
  const response = { setHeader: vi.fn() };
  return {
    ctx: {
      user,
      req: { headers: {} },
      res: response,
    } as unknown as TrpcContext,
    response,
  };
}

describe("voice.transcribeAndTranslate", () => {
  it("passes an audio clip through STT and translation with structured metadata", async () => {
    vi.mocked(transcribeChunk).mockResolvedValue({
      task: "transcribe",
      language: "en",
      duration: 1.25,
      text: "Hello from the microphone",
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 1.25,
          text: "Hello from the microphone",
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 0,
          no_speech_prob: 0,
        },
      ],
    });
    vi.mocked(translateMeetingText).mockResolvedValue({
      translation: "مرحبًا من الميكروفون",
      provider: "deterministic-test-provider",
      model: "test-model",
    });

    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.transcribeAndTranslate({
      inviteCode: "ABCD2345",
      audioBase64: "AQID",
      mimeType: "audio/webm",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });

    expect(transcribeChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: Buffer.from([1, 2, 3]),
        mimeType: "audio/webm",
        language: "en",
      })
    );
    expect(translateMeetingText).toHaveBeenCalledWith({
      text: "Hello from the microphone",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
    expect(result).toEqual({
      originalText: "Hello from the microphone",
      translatedText: "مرحبًا من الميكروفون",
      detectedLanguage: "en",
      durationSeconds: 1.25,
      segments: [{ start: 0, end: 1.25, text: "Hello from the microphone" }],
      provider: "deterministic-test-provider",
      model: "test-model",
    });
  });

  it("blocks processing when all active participants have not consented", async () => {
    const { isMeetingPersistenceAllowed } = await import("../db");
    vi.mocked(isMeetingPersistenceAllowed).mockResolvedValueOnce(false);

    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.voice.transcribeAndTranslate({
        inviteCode: "ABCD2345",
        audioBase64: "AQID",
        mimeType: "audio/webm",
        sourceLanguage: "en",
        targetLanguage: "ar",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects users who are not active meeting participants", async () => {
    const { isActiveMeetingParticipant } = await import("../db");
    vi.mocked(isActiveMeetingParticipant).mockResolvedValueOnce(false);

    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.voice.transcribeAndTranslate({
        inviteCode: "ABCD2345",
        audioBase64: "AQID",
        mimeType: "audio/webm",
        sourceLanguage: "en",
        targetLanguage: "ar",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps STT rate limits and exposes only a numeric Retry-After header", async () => {
    const error = Object.assign(
      new SpeechServiceError(
        "RATE_LIMITED",
        "safe rate limit message",
        429,
        3500
      ),
      { code: "RATE_LIMITED", statusCode: 429, retryAfterMs: 3500 }
    );
    vi.mocked(transcribeChunk).mockRejectedValueOnce(error);

    const { ctx, response } = createContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.voice.transcribeAndTranslate({
        inviteCode: "ABCD2345",
        audioBase64: "AQID",
        mimeType: "audio/webm",
        sourceLanguage: "en",
        targetLanguage: "ar",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "4");
  });
});
