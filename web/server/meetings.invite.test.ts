import { describe, expect, it } from "vitest";
import { buildInvitePath, createInviteCode, isValidInviteCode } from "../shared/meetingUtils";

describe("meeting invitation codes", () => {
  it("creates a valid code from the readable safe alphabet", () => {
    const code = createInviteCode(() => 0, 8);
    expect(code).toBe("22222222");
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("never builds an invitation URL from an unsafe route fragment", () => {
    expect(buildInvitePath("ABCD2345")).toBe("/join/ABCD2345");
    expect(() => buildInvitePath("ABC/2345")).toThrow("Invalid meeting invite code");
  });
});
