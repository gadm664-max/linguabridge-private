import { describe, expect, it } from "vitest";
import { decodeBase64Audio, requireRealtimeConsent, roomNameForMeeting } from "./mobile";

describe("mobile meeting helpers", () => {
  it("decodes a valid base64 audio payload", () => {
    expect(decodeBase64Audio("AQID")).toEqual(Buffer.from([1, 2, 3]));
  });

  it("rejects malformed audio payloads", () => {
    expect(() => decodeBase64Audio("not-valid")).toThrow("Invalid audio payload");
  });

  it("creates a non-guessable provider room namespace from the meeting id", () => {
    expect(roomNameForMeeting(42)).toBe("linguabridge-meeting-42");
  });

  it("blocks realtime access until every active participant consents", () => {
    expect(() => requireRealtimeConsent(false)).toThrow("All active participants must consent");
    expect(() => requireRealtimeConsent(true)).not.toThrow();
  });
});
