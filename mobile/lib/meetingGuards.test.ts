import { describe, expect, it } from "vitest";
import { canProcessMeetingAudio, requireInviteCode } from "./meetingGuards";

describe("meeting audio guards", () => {
  it("normalizes valid invitation codes", () => {
    expect(requireInviteCode(" abcd2345 ")).toBe("ABCD2345");
  });

  it("rejects audio processing without a valid meeting invitation", () => {
    expect(canProcessMeetingAudio({ inviteCode: "bad", hasRecordingUri: true, hasStorageConsent: true }))
      .toMatchObject({ allowed: false });
  });

  it("requires a recorded clip and storage consent", () => {
    expect(canProcessMeetingAudio({ inviteCode: "ABCD2345", hasRecordingUri: false, hasStorageConsent: true }))
      .toMatchObject({ allowed: false });
    expect(canProcessMeetingAudio({ inviteCode: "ABCD2345", hasRecordingUri: true, hasStorageConsent: false }))
      .toMatchObject({ allowed: false });
    expect(canProcessMeetingAudio({ inviteCode: "ABCD2345", hasRecordingUri: true, hasStorageConsent: true }))
      .toEqual({ allowed: true });
  });
});
