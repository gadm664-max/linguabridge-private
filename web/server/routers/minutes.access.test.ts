import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getMeetingForInvite: vi.fn(),
  getMinutesForMeeting: vi.fn(),
  getTranscriptForMeeting: vi.fn(),
  isMeetingParticipant: vi.fn(),
  isMeetingPersistenceAllowed: vi.fn(),
  saveMinutesForMeeting: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

import { minutesRouter } from "./minutes";

describe("minutes access policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getMeetingForInvite.mockResolvedValue({ id: 42, inviteCode: "ABCDEFGH", title: "جلسة اختبار" });
    dbMocks.getMinutesForMeeting.mockResolvedValue(null);
    dbMocks.getTranscriptForMeeting.mockResolvedValue([]);
  });

  it("returns verified minutes to a recorded participant", async () => {
    dbMocks.isMeetingParticipant.mockResolvedValue(true);
    const caller = minutesRouter.createCaller({ user: { id: 9, name: "مشارك الاختبار" } } as never);
    const result = await caller.get({ inviteCode: "ABCDEFGH" });
    expect(result.meeting.id).toBe(42);
    expect(dbMocks.isMeetingParticipant).toHaveBeenCalledWith(42, 9);
  });

  it("rejects a signed-in user who was not recorded as a participant", async () => {
    dbMocks.isMeetingParticipant.mockResolvedValue(false);
    const caller = minutesRouter.createCaller({ user: { id: 12, name: "غير مشارك" } } as never);
    await expect(caller.get({ inviteCode: "ABCDEFGH" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.getMinutesForMeeting).not.toHaveBeenCalled();
  });

  it("rejects generation by a non-participant before persistence or generation work", async () => {
    dbMocks.isMeetingParticipant.mockResolvedValue(false);
    const caller = minutesRouter.createCaller({ user: { id: 12, name: "غير مشارك" } } as never);
    await expect(caller.generate({ inviteCode: "ABCDEFGH", targetLanguage: "ar" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.isMeetingPersistenceAllowed).not.toHaveBeenCalled();
    expect(dbMocks.getTranscriptForMeeting).not.toHaveBeenCalled();
    expect(dbMocks.saveMinutesForMeeting).not.toHaveBeenCalled();
  });
});
