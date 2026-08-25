import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  appendTranscriptSegment: vi.fn(),
  createMeeting: vi.fn(),
  exportUserAccountData: vi.fn(),
  getMeetingForInvite: vi.fn(),
  getUserPreferences: vi.fn(),
  inviteCodeExists: vi.fn(),
  isMeetingPersistenceAllowed: vi.fn(),
  joinMeeting: vi.fn(),
  listMeetingsForHost: vi.fn(),
  saveUserPreferences: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

import { meetingsRouter } from "./meetings";

describe("meetings.create invite sharing policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.inviteCodeExists.mockResolvedValue(false);
    dbMocks.createMeeting.mockResolvedValue({
      id: 23,
      inviteCode: "ABCDEFGH",
      title: "اجتماع اختبار",
      status: "lobby",
      inviteSharingEnabled: false,
    });
  });

  it("persists an explicit disabled sharing-tools choice without disabling the invite code", async () => {
    const caller = meetingsRouter.createCaller({
      user: { id: 9, name: "مضيف الاختبار" },
    } as never);

    const result = await caller.create({
      title: "اجتماع اختبار",
      storageConsent: true,
      inviteSharingEnabled: false,
      speakingLanguage: "ar",
      displayLanguage: "en",
      voiceName: "natural",
      voiceRate: "1.0",
    });

    expect(dbMocks.createMeeting).toHaveBeenCalledWith(expect.objectContaining({
      hostUserId: 9,
      inviteSharingEnabled: false,
    }));
    expect(result).toMatchObject({
      inviteSharingEnabled: false,
    });
    expect(result.invitePath).toMatch(/^\/join\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/);
  });
});
