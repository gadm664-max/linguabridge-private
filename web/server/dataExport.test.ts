import { describe, expect, it } from "vitest";
import { buildUserDataExport } from "./dataExport";

describe("buildUserDataExport", () => {
  it("keeps the export scoped to the requesting account and its own participation metadata", () => {
    const output = buildUserDataExport(
      { id: 7, name: "Nora", email: "nora@example.com", role: "user", createdAt: new Date("2026-08-01T00:00:00Z") },
      null,
      [{ meetingId: 11, title: "مراجعة", status: "ended", meetingCreatedAt: new Date("2026-08-02T00:00:00Z"), startedAt: null, endedAt: null, joinedAt: new Date("2026-08-02T00:01:00Z"), leftAt: null, speakingLanguage: "ar", displayLanguage: "en", voiceName: "natural", voiceRate: "1.0", storageConsent: true }],
    );

    expect(output.account).toMatchObject({ id: 7, email: "nora@example.com" });
    expect(output.meetingParticipation[0]).toMatchObject({ meetingId: 11, speakingLanguage: "ar" });
    expect(JSON.stringify(output)).not.toContain("participantId");
    expect(JSON.stringify(output)).not.toContain("originalText");
    expect(JSON.stringify(output)).not.toContain("translatedText");
  });
});
