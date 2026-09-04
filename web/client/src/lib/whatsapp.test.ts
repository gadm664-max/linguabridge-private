import { describe, expect, it } from "vitest";
import { buildMeetingInviteShare, buildMinutesShare } from "./whatsapp";

describe("WhatsApp share links", () => {
  it("encodes only the invitation title and secure join link", () => {
    const link = buildMeetingInviteShare("https://linguabridge.example", "ABCD2345", "جلسة خطة الإطلاق");
    expect(link).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(link)).toContain("https://linguabridge.example/join/ABCD2345");
  });

  it("shares a protected minutes link without embedding the minutes body", () => {
    const link = buildMinutesShare("https://linguabridge.example", "ABCD2345", "محضر خاص");
    const decoded = decodeURIComponent(link);
    expect(decoded).toContain("/minutes/ABCD2345");
    expect(decoded).toContain("يتطلب الرابط صلاحية وصول");
  });
});
