import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");
const webMeeting = readFileSync(resolve(webRoot, "client/src/pages/Meeting.tsx"), "utf8");
const mobileMeeting = readFileSync(resolve(webRoot, "..", "linguabridge-mobile", "app", "meeting.tsx"), "utf8");

describe("meeting control accessibility", () => {
  it("exposes the toggled states of the primary controls on web and mobile", () => {
    expect(webMeeting).toContain("aria-pressed={pressed}");
    expect(webMeeting).toContain("pressed={muted}");
    expect(webMeeting).toContain("pressed={recording}");
    expect(mobileMeeting).toContain("accessibilityState={{ selected: muted }}");
    expect(mobileMeeting).toContain("accessibilityState={{ selected: listening, busy: processing }}");
    expect(mobileMeeting).toContain("accessibilityState={{ selected: roomConnected }}");
    expect(mobileMeeting).toContain("accessibilityState={{ selected: Boolean(directState) }}");
  });
});
