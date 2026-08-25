import { describe, expect, it } from "vitest";
import { isInviteSharingEnabled, normalizeInviteCode } from "./inviteSharing";

describe("invite sharing state", () => {
  it("enables sharing by default and disables it only for the explicit session flag", () => {
    expect(isInviteSharingEnabled(undefined)).toBe(true);
    expect(isInviteSharingEnabled("1")).toBe(true);
    expect(isInviteSharingEnabled("0")).toBe(false);
  });

  it("accepts a direct code or a full join link and rejects unrelated input", () => {
    expect(normalizeInviteCode("ab2d345e")).toBe("AB2D345E");
    expect(normalizeInviteCode("https://linguameet.example/join/AB2D345E?source=share")).toBe("AB2D345E");
    expect(normalizeInviteCode("linguabridge://join?inviteCode=AB2D345E")).toBe("AB2D345E");
    expect(normalizeInviteCode("https://example.com/not-an-invite")).toBe("");
  });
});
