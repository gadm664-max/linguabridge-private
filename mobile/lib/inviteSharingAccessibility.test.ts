import { describe, expect, it } from "vitest";
import { inviteSharingAccessibility } from "./inviteSharingAccessibility";

describe("inviteSharingAccessibility", () => {
  it("announces a clear switch label and checked state", () => {
    expect(inviteSharingAccessibility.label).toContain("مشاركة رابط الدعوة");
    expect(inviteSharingAccessibility.state(true)).toEqual({ checked: true });
    expect(inviteSharingAccessibility.state(false)).toEqual({ checked: false });
  });
});
