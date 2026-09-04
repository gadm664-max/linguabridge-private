import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudioBuffer } from "./voiceTranscription";

vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.test",
    forgeApiKey: "test-only-key",
  },
}));

type MockResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

function response(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn(async () => body),
  };
}

const validResponse = {
  task: "transcribe" as const,
  language: "en",
  duration: 1,
  text: "hello",
  segments: [],
};

describe("transcribeAudioBuffer", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts a valid audio buffer and returns the Whisper response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(validResponse))
    );

    await expect(
      transcribeAudioBuffer({
        audio: Buffer.from([1, 2, 3]),
        mimeType: "audio/webm",
        language: "en",
      })
    ).resolves.toEqual(validResponse);
    expect(fetch).toHaveBeenCalledWith(
      "https://forge.example.test/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-only-key",
        }),
      })
    );
  });

  it.each([401, 403])("maps %s to authentication failure", async status => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ error: "provider secret" }, status))
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      error: "Transcription service authentication failed",
    });
  });

  it("maps 429 and Retry-After to a structured rate-limit result", async () => {
    const result = response({}, 429);
    result.headers.set("retry-after", "3");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => result)
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 3000 });
  });

  it("does not expose malformed provider JSON or response details", async () => {
    const result = response({}, 200);
    result.json = vi.fn(async () => {
      throw new Error("provider response secret");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => result)
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toEqual({
      error: "Invalid transcription response",
      code: "MALFORMED_RESPONSE",
    });
  });

  it("rejects an invalid response shape as MALFORMED_RESPONSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ language: "en" }))
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("maps timeout and network failures without returning raw exception text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("internal network detail");
        error.name = "TimeoutError";
        throw error;
      })
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toEqual({
      error: "Voice transcription timed out",
      code: "TIMEOUT",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("internal network detail");
      })
    );
    await expect(
      transcribeAudioBuffer({ audio: Buffer.from([1]), mimeType: "audio/webm" })
    ).resolves.toEqual({
      error: "Voice transcription failed",
      code: "NETWORK_FAILURE",
    });
  });

  it("enforces the 16MB buffer limit before calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      transcribeAudioBuffer({
        audio: Buffer.alloc(16 * 1024 * 1024 + 1),
        mimeType: "audio/webm",
      })
    ).resolves.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
