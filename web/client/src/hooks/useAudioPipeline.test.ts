import { describe, expect, it } from "vitest";
import { selectAudioMimeType } from "./useAudioPipeline";

describe("useAudioPipeline helpers", () => {
  it("falls back to a server-supported MIME type when MediaRecorder is unavailable", () => {
    expect(selectAudioMimeType()).toBe("audio/webm");
  });
});
