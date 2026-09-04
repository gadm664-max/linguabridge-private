import { describe, expect, it } from "vitest";
import { getNativeMeetingStatusLabel } from "./meetingStatus";

describe("getNativeMeetingStatusLabel", () => {
  it("uses the meeting-state labels from the shared contract", () => {
    expect(getNativeMeetingStatusLabel("lobby")).toBe("في الردهة");
    expect(getNativeMeetingStatusLabel("active")).toBe("نشطة");
    expect(getNativeMeetingStatusLabel("ended")).toBe("انتهت");
  });

  it("uses a safe fallback for an unknown status", () => {
    expect(getNativeMeetingStatusLabel("unexpected")).toBe("حالة غير معروفة");
  });
});
