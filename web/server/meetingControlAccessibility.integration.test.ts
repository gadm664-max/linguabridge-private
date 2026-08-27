import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");
const webMeeting = readFileSync(
  resolve(webRoot, "client/src/pages/Meeting.tsx"),
  "utf8"
);
const mobileMeeting = readFileSync(
  resolve(webRoot, "..", "mobile", "app", "meeting.tsx"),
  "utf8"
);

describe("meeting control accessibility", () => {
  it("exposes the toggled states of the primary controls on web and mobile", () => {
    expect(webMeeting).toContain("active?: boolean");
    expect(webMeeting).toContain("active={muteControl.active}");
    expect(webMeeting).toContain("active={liveTranscriptionControl.active}");
    expect(mobileMeeting).toContain("active={muted}");
    expect(mobileMeeting).toContain("active={liveTranscriptionControl.active}");
    expect(mobileMeeting).toContain("active={roomConnected}");
    expect(mobileMeeting).toContain("active={Boolean(directState)}");
  });
});
