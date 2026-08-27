import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webMeeting = readFileSync(new URL("../client/src/pages/Meeting.tsx", import.meta.url), "utf8");
const mobileMeeting = readFileSync(new URL("../../mobile/app/meeting.tsx", import.meta.url), "utf8");

describe("shared live transcript status integration", () => {
  it("renders the shared status helper in both clients and derives the current state", () => {
    expect(webMeeting).toContain("getLiveTranscriptionStatus(");
    expect(webMeeting).toContain('recording ? "listening" : "idle"');
    expect(mobileMeeting).toContain("getLiveTranscriptionStatus(");
    expect(mobileMeeting).toContain('processing ? "processing" : listening ? "listening" : "idle"');
  });
});
