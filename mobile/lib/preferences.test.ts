import { describe, expect, it } from "vitest";
import { defaultMobilePreferences, normalizeMobilePreferences } from "./preferenceModel";

describe("mobile preferences", () => {
  it("uses safe defaults for invalid stored data", () => {
    expect(normalizeMobilePreferences(null)).toEqual(defaultMobilePreferences);
    expect(normalizeMobilePreferences({ speechLanguage: "unknown", voiceRate: Number.NaN })).toEqual(defaultMobilePreferences);
  });

  it("keeps supported languages and voice profiles while clamping speech speed", () => {
    expect(normalizeMobilePreferences({ speechLanguage: "fr", displayLanguage: "ar", voiceName: "warm", voiceRate: 3, askBeforeStorage: false, meetingReminders: false })).toEqual({ speechLanguage: "fr", displayLanguage: "ar", voiceName: "warm", voiceRate: 1.4, askBeforeStorage: false, meetingReminders: false });
  });
});
