import { describe, expect, it } from "vitest";

describe("Deepgram credentials", () => {
  it.skipIf(!process.env.DEEPGRAM_API_KEY)("authenticates with the read-only projects endpoint without sending audio", async () => {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${apiKey}` },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});
