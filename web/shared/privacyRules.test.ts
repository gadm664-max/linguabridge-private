import { describe, expect, it } from "vitest";
import { canPersistMeetingContent } from "./privacyRules";

describe("meeting privacy rules", () => {
  it("allows persistence only after every active participant consents", () => {
    expect(canPersistMeetingContent({ meetingStorageConsent: true, activeParticipantConsents: [true, true] })).toBe(true);
    expect(canPersistMeetingContent({ meetingStorageConsent: true, activeParticipantConsents: [true, false] })).toBe(false);
  });

  it("rejects persistence without meeting consent or participants", () => {
    expect(canPersistMeetingContent({ meetingStorageConsent: false, activeParticipantConsents: [true] })).toBe(false);
    expect(canPersistMeetingContent({ meetingStorageConsent: true, activeParticipantConsents: [] })).toBe(false);
  });
});
