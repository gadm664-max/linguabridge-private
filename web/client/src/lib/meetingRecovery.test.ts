import { describe, expect, it } from "vitest";
import {
  getMeetingInviteRecoveryPath,
  meetingInviteNotFoundMessage,
  shouldRecoverFromMeetingInviteError,
} from "./meetingRecovery";

describe("meeting invite recovery", () => {
  it("returns an unavailable invitation to the lobby with a clear recovery message", () => {
    expect(getMeetingInviteRecoveryPath()).toBe("/lobby");
    expect(meetingInviteNotFoundMessage).toContain("تعذر العثور");
    expect(meetingInviteNotFoundMessage).toContain("اجتماعًا جديدًا");
    expect(shouldRecoverFromMeetingInviteError("NOT_FOUND")).toBe(true);
    expect(shouldRecoverFromMeetingInviteError("UNAUTHORIZED")).toBe(false);
    expect(shouldRecoverFromMeetingInviteError(undefined)).toBe(false);
  });
});
