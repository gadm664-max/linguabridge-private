import { describe, expect, it } from "vitest";
import { buildInvitePath, createInviteCode, isValidInviteCode } from "./meetingUtils";

describe("meeting invite utilities", () => {
  it("creates a readable invite code in the allowed alphabet", () => {
    const code = createInviteCode(() => 0, 10);
    expect(code).toBe("2222222222");
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("builds only validated invitation paths", () => {
    expect(buildInvitePath("ABCD2345")).toBe("/join/ABCD2345");
    expect(() => buildInvitePath("../../unsafe")).toThrow("Invalid meeting invite code");
  });
});
