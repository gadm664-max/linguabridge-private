import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ consent: false, participantActive: true }));

vi.mock("../db", () => ({
  getMeetingForInvite: vi.fn(async () => ({ id: 42, inviteCode: "ABCD2345", title: "جلسة اختبار", status: "live", storageConsent: true })),
  isActiveMeetingParticipant: vi.fn(async () => state.participantActive),
  isMeetingPersistenceAllowed: vi.fn(async () => state.consent),
  appendTranscriptSegment: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    forgeApiUrl: "",
    forgeApiKey: "",
    livekitUrl: "wss://example.livekit.cloud",
    livekitApiKey: "api-key",
    livekitApiSecret: "api-secret",
  },
}));

import { appRouter } from "../routers";

function createCaller() {
  return appRouter.createCaller({
    user: {
      id: 7,
      openId: "test-user",
      name: "مشارك اختبار",
      email: null,
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as never,
    res: {} as never,
  });
}

describe("mobile.realtime.issueRoomToken", () => {
  beforeEach(() => {
    state.consent = false;
    state.participantActive = true;
  });

  it("returns PRECONDITION_FAILED before creating a room JWT when consent is incomplete", async () => {
    await expect(createCaller().mobile.realtime.issueRoomToken({ inviteCode: "ABCD2345" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("returns a short-lived managed-room token only for an active, consenting participant", async () => {
    state.consent = true;
    const token = await createCaller().mobile.realtime.issueRoomToken({ inviteCode: "ABCD2345" });

    expect(token.serverUrl).toBe("wss://example.livekit.cloud");
    expect(token.roomName).toBe("linguabridge-meeting-42");
    expect(token.participantToken.split(".")).toHaveLength(3);
    expect(token.expiresInSeconds).toBe(600);
  });
});
