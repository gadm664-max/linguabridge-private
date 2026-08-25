import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const mutate = vi.fn();

vi.mock("expo-file-system/legacy", () => ({ default: {} }));
vi.mock("./api", () => ({
  getApi: () => ({ meetings: { byInvite: { query }, join: { mutate } } }),
}));

import { getNativeMeetingInvitation, joinNativeMeeting } from "./meetingService";

describe("native meeting join service", () => {
  beforeEach(() => {
    query.mockReset();
    mutate.mockReset();
  });

  it("reads the stored invitation-sharing policy and forwards join preferences", async () => {
    query.mockResolvedValue({ inviteCode: "ABCD2345", title: "مراجعة", status: "lobby", storageConsent: true, inviteSharingEnabled: false });
    mutate.mockResolvedValue({ inviteCode: "ABCD2345", title: "مراجعة", status: "lobby", inviteSharingEnabled: false });

    await expect(getNativeMeetingInvitation("ABCD2345")).resolves.toMatchObject({ inviteSharingEnabled: false });
    await expect(joinNativeMeeting({ inviteCode: "ABCD2345", speakingLanguage: "ar", displayLanguage: "en", voiceName: "natural", voiceRate: "1.0", storageConsent: true })).resolves.toMatchObject({ inviteSharingEnabled: false });

    expect(query).toHaveBeenCalledWith({ inviteCode: "ABCD2345" });
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ inviteCode: "ABCD2345", storageConsent: true }));
  });
});
