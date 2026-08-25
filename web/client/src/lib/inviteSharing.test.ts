import { describe, expect, it } from "vitest";
import { isInviteSharingEnabled } from "./inviteSharing";

describe("invite sharing state", () => {
  it("keeps sharing enabled unless the session explicitly disables it", () => {
    expect(isInviteSharingEnabled("")).toBe(true);
    expect(isInviteSharingEnabled("?share=1")).toBe(true);
    expect(isInviteSharingEnabled("?share=0")).toBe(false);
  });
});
