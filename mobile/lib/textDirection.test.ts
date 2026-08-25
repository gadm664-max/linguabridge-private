import { describe, expect, it } from "vitest";
import { isLeftToRightMeetingLanguage } from "./textDirection";

describe("isLeftToRightMeetingLanguage", () => {
  it("uses the shared language contract for code and display-label directions", () => {
    expect(isLeftToRightMeetingLanguage("ar")).toBe(false);
    expect(isLeftToRightMeetingLanguage("العربية")).toBe(false);
    expect(isLeftToRightMeetingLanguage("en")).toBe(true);
    expect(isLeftToRightMeetingLanguage("English")).toBe(true);
    expect(isLeftToRightMeetingLanguage("Français")).toBe(true);
  });
});
