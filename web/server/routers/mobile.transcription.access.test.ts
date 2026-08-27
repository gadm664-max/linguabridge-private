import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ participantActive: true, consent: true }));
const dbMocks = vi.hoisted(() => ({
  appendTranscriptSegment: vi.fn(),
  getMeetingForInvite: vi.fn(async () => ({ id: 42, inviteCode: "ABCD2345", title: "جلسة اختبار", status: "live" })),
  isActiveMeetingParticipant: vi.fn(async () => state.participantActive),
  isMeetingPersistenceAllowed: vi.fn(async () => state.consent),
}));
const storageMocks = vi.hoisted(() => ({ storagePut: vi.fn(async () => ({ key: "meeting-audio/test.m4a", url: "https://storage.example.test/test.m4a" })) }));
const deepgramMocks = vi.hoisted(() => ({ transcribeWithDeepgram: vi.fn(async () => ({ text: "مرحبا", language: "ar", duration: 1, segments: [{ start: 0, end: 1, text: "مرحبا" }] })) }));

vi.mock("../db", () => dbMocks);
vi.mock("../storage", () => storageMocks);
vi.mock("../services/deepgramTranscription", () => deepgramMocks);
vi.mock("../services/translationService", () => ({ translateMeetingText: vi.fn(async () => ({ translation: "Hello", model: "test" })) }));
vi.mock("../_core/env", () => ({ ENV: { livekitUrl: "", livekitApiKey: "", livekitApiSecret: "" } }));

import { appRouter } from "../routers";

function createCaller() {
  return appRouter.createCaller({
    user: { id: 7, openId: "test-user", name: "مشارك اختبار", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as never,
    res: {} as never,
  });
}

const transcriptionInput = { inviteCode: "ABCD2345", audioBase64: "AQID", mimeType: "audio/m4a" as const, sourceLanguage: "ar", targetLanguage: "en" };

describe("mobile.transcribeAndTranslate access", () => {
  beforeEach(() => {
    state.participantActive = true;
    state.consent = true;
    vi.clearAllMocks();
  });

  it("rejects a nonparticipant before storage or Deepgram receive audio", async () => {
    state.participantActive = false;
    await expect(createCaller().mobile.transcribeAndTranslate(transcriptionInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storageMocks.storagePut).not.toHaveBeenCalled();
    expect(deepgramMocks.transcribeWithDeepgram).not.toHaveBeenCalled();
  });

  it("rejects incomplete consent before storage or Deepgram receive audio", async () => {
    state.consent = false;
    await expect(createCaller().mobile.transcribeAndTranslate(transcriptionInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(storageMocks.storagePut).not.toHaveBeenCalled();
    expect(deepgramMocks.transcribeWithDeepgram).not.toHaveBeenCalled();
  });

  it("sends a consenting participant's decoded audio to the server-only Deepgram client", async () => {
    await expect(createCaller().mobile.transcribeAndTranslate(transcriptionInput)).resolves.toMatchObject({ originalText: "مرحبا", translatedText: "Hello" });
    expect(deepgramMocks.transcribeWithDeepgram).toHaveBeenCalledWith(expect.objectContaining({ audio: Buffer.from([1, 2, 3]), mimeType: "audio/m4a", language: "ar" }));
  });
});
