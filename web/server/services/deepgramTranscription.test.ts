import { describe, expect, it, vi } from "vitest";
import { transcribeWithDeepgram } from "./deepgramTranscription";

describe("transcribeWithDeepgram", () => {
  it("sends pre-recorded audio from the server with a token header and returns minimal meeting segments", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metadata: { duration: 2.4 },
      results: {
        channels: [{ detected_language: "ar", alternatives: [{ transcript: "مرحبا بالفريق" }] }],
        utterances: [{ start: 0, end: 2.4, transcript: "مرحبا بالفريق" }],
      },
    }), { status: 200 }));

    const result = await transcribeWithDeepgram({ audio: Buffer.from("audio"), mimeType: "audio/m4a", language: "ar" }, fetchImpl);

    expect(result).toEqual({ text: "مرحبا بالفريق", language: "ar", duration: 2.4, segments: [{ start: 0, end: 2.4, text: "مرحبا بالفريق" }] });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("https://api.deepgram.com/v1/listen?"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Token /), "Content-Type": "audio/m4a" }),
    }));
  });

  it("does not expose a provider response when transcription fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("provider details", { status: 401 }));
    await expect(transcribeWithDeepgram({ audio: Buffer.from("audio"), mimeType: "audio/m4a", language: "ar" }, fetchImpl))
      .resolves.toEqual({ error: "Deepgram transcription request failed", code: "TRANSCRIPTION_FAILED" });
  });
});
