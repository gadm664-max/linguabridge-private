import { describe, expect, it } from "vitest";
import { getMeetingStatusLabel } from "./meetingStatus";

describe("getMeetingStatusLabel", () => {
  it("uses the shared meeting-state labels consumed by the mobile app", () => {
    expect(getMeetingStatusLabel("lobby")).toBe("في الردهة");
    expect(getMeetingStatusLabel("active")).toBe("نشطة");
    expect(getMeetingStatusLabel("ended")).toBe("انتهت");
  });

  it("does not expose an unknown server status as a user-facing label", () => {
    expect(getMeetingStatusLabel("unexpected")).toBe("حالة غير معروفة");
  });
});
