import { describe, expect, it } from "vitest";
import { isInviteSharingEnabled } from "./inviteSharing";

describe("invite sharing state", () => {
  it("enables sharing by default and disables it only for the explicit session flag", () => {
    expect(isInviteSharingEnabled(undefined)).toBe(true);
    expect(isInviteSharingEnabled("1")).toBe(true);
    expect(isInviteSharingEnabled("0")).toBe(false);
  });
});
