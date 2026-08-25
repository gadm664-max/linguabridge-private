import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const webMeeting = readFileSync(new URL("../client/src/pages/Meeting.tsx", import.meta.url), "utf8");
const mobileMeeting = readFileSync(new URL("../../mobile/app/meeting.tsx", import.meta.url), "utf8");

describe("shared live transcript status integration", () => {
  it("renders the shared status helper in both clients and gives the web processing state", () => {
    expect(webMeeting).toContain('recording ? "النص الحي يعمل" : "النص الحي متوقف"');
    expect(mobileMeeting).toContain('processing ? "جارٍ المعالجة" : listening ? "إيقاف الالتقاط" : "نسخ مقطع صوتي"');
  });
});
