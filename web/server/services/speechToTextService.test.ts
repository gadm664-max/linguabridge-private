import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudioBuffer } from "../_core/voiceTranscription";
import {
  ManusWhisperSpeechToTextProvider,
  SpeechToTextServiceError,
} from "./speechToTextService";

vi.mock("../_core/voiceTranscription", () => ({
  transcribeAudioBuffer: vi.fn(),
}));

describe("ManusWhisperSpeechToTextProvider", () => {
  const provider = new ManusWhisperSpeechToTextProvider();

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
      expect(error).toBeInstanceOf(SpeechToTextServiceError);
      expect(error).toMatchObject({
        code: "RATE_LIMITED",
        statusCode: 429,
        retryAfterMs: 3000,
      });
    }
  });
});
