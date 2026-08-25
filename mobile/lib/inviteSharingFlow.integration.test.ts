import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  byInvite: vi.fn(),
}));

vi.mock("./api", () => ({
  getApi: () => ({
    meetings: {
      create: { mutate: apiMocks.create },
      byInvite: { query: apiMocks.byInvite },
    },
  }),
}));

vi.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: vi.fn(),
}));

import { buildNativeMeetingRouteParams, resolveInviteSharingEnabled } from "./inviteSharingPolicy";
import { createNativeMeeting, getNativeMeetingForInvite } from "./meetingService";

describe("native invite-sharing flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.create.mockResolvedValue({
      inviteCode: "ABCDEFGH",
      title: "اجتماع خاص",
      status: "lobby",
      inviteSharingEnabled: false,
    });
    apiMocks.byInvite.mockResolvedValue({
      inviteCode: "ABCDEFGH",
      title: "اجتماع خاص",
      status: "lobby",
      storageConsent: true,
      inviteSharingEnabled: false,
    });
  });

  it("keeps sharing tools hidden from lobby creation through the server-backed room policy", async () => {
    const meeting = await createNativeMeeting({
      title: "اجتماع خاص",
      speakingLanguage: "ar",
      displayLanguage: "en",
      storageConsent: true,
      inviteSharingEnabled: false,
      voiceName: "natural",
      voiceRate: "1.0",
    });
    const route = buildNativeMeetingRouteParams({ meeting, speaking: "ar", display: "en" });
    const savedMeeting = await getNativeMeetingForInvite(route.inviteCode);

    expect(apiMocks.create).toHaveBeenCalledWith(expect.objectContaining({ inviteSharingEnabled: false }));
    expect(apiMocks.byInvite).toHaveBeenCalledWith({ inviteCode: "ABCDEFGH" });
    expect(route.share).toBe("0");
    expect(resolveInviteSharingEnabled({
      inviteCode: route.inviteCode,
      share: route.share,
      serverPolicy: savedMeeting.inviteSharingEnabled,
    })).toBe(false);
  });
});
