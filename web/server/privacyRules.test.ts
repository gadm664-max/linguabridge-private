import { describe, expect, it } from "vitest";
import { meetingPrivacyDefaults, meetingStateLabels, supportedLanguages } from "../shared/meetingSpecs";

describe("shared meeting specifications", () => {
  it("keeps Arabic as a supported RTL meeting language", () => {
    expect(supportedLanguages.find(language => language.value === "ar")).toMatchObject({ direction: "rtl", locale: "ar-SA" });
  });

  it("declares consent and state semantics once for all platforms", () => {
    expect(meetingPrivacyDefaults.requiresUnanimousActiveParticipantConsent).toBe(true);
    expect(meetingStateLabels.active).toBe("نشطة");
  });
});
