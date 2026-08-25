import { describe, expect, it } from "vitest";
import { buildNativeMeetingRouteParams, resolveInviteSharingEnabled } from "./inviteSharingPolicy";
import { getLobbyInviteGuidance } from "./specs";

describe("resolveInviteSharingEnabled", () => {
  it("uses the persisted server policy over a link parameter", () => {
    expect(resolveInviteSharingEnabled({ inviteCode: "ABCDEFGH", share: "1", serverPolicy: false })).toBe(false);
    expect(resolveInviteSharingEnabled({ inviteCode: "ABCDEFGH", share: "0", serverPolicy: true })).toBe(true);
  });

  it("keeps sharing hidden while a meeting policy is still loading", () => {
    expect(resolveInviteSharingEnabled({ inviteCode: "ABCDEFGH", share: "1" })).toBe(false);
    expect(resolveInviteSharingEnabled({ share: "1" })).toBe(true);
  });

  it("carries a disabled choice from meeting creation to the mobile room display", () => {
    const route = buildNativeMeetingRouteParams({
      meeting: { title: "اجتماع خاص", inviteCode: "ABCDEFGH", inviteSharingEnabled: false },
      speaking: "ar",
      display: "en",
    });

    expect(route).toMatchObject({ inviteCode: "ABCDEFGH", share: "0" });
    expect(resolveInviteSharingEnabled({ inviteCode: route.inviteCode, share: route.share, serverPolicy: false })).toBe(false);
  });

  it("shows the corrected shared explanation when invite sharing tools are disabled", () => {
    expect(getLobbyInviteGuidance(false)).toContain("رمز الانضمام صالحًا");
  });
});
