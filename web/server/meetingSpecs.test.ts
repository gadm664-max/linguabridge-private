import { describe, expect, it } from "vitest";
import { defaultVoiceProfile, defaultVoiceRate, getLiveTranscriptStatus, getLobbyInviteGuidance, getMuteControlLabel, liveTranscriptCopy, lobbyReadinessCopy, meetingControlCopy, normalizeVoiceProfile, normalizeVoiceRate, supportedLanguages, supportedVoiceProfiles, supportedVoiceRates } from "@linguabridge/contracts/meetingSpecs";

describe("shared meeting specifications", () => {
  it("publishes the same supported language set used by web and mobile clients", () => {
    expect(supportedLanguages.map(language => language.code)).toEqual(["ar", "en", "fr", "es", "de", "it", "pt", "tr", "ja", "ko", "zh"]);
  });

  it("defines bounded selectable voice rates and a compatible default", () => {
    expect(supportedVoiceRates.map(rate => rate.value)).toEqual([0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4]);
    expect(defaultVoiceRate).toBe(1);
    expect(normalizeVoiceRate(9)).toBe(1.4);
    expect(normalizeVoiceRate(0)).toBe(0.7);
  });

  it("publishes stable readable voice profiles for both clients", () => {
    expect(supportedVoiceProfiles.map(profile => profile.value)).toEqual(["natural", "warm", "clear"]);
    expect(defaultVoiceProfile).toBe("natural");
    expect(normalizeVoiceProfile("warm")).toBe("warm");
    expect(normalizeVoiceProfile("unknown")).toBe("natural");
  });

  it("provides the same privacy-safe lobby guidance to every client", () => {
    expect(lobbyReadinessCopy.microphone.testAction).toBe("اختبار الميكروفون");
    expect(lobbyReadinessCopy.consent.required).toContain("موافقتك");
    expect(lobbyReadinessCopy.invite.enabled).toContain("مشاركته");
    expect(lobbyReadinessCopy.invite.disabled).toContain("أدوات نسخ أو مشاركة");
    expect(getLobbyInviteGuidance(true)).toBe(lobbyReadinessCopy.invite.enabled);
    expect(getLobbyInviteGuidance(false)).toBe(lobbyReadinessCopy.invite.disabled);
  });

  it("provides the same accessible labels for mute controls", () => {
    expect(getMuteControlLabel(false)).toBe(meetingControlCopy.audio.mute);
    expect(getMuteControlLabel(true)).toBe(meetingControlCopy.audio.unmute);
  });

  it("provides stable status copy for stopped, active, and processing transcription", () => {
    expect(getLiveTranscriptStatus(false)).toBe(liveTranscriptCopy.stopped);
    expect(getLiveTranscriptStatus(true)).toBe(liveTranscriptCopy.active);
    expect(getLiveTranscriptStatus(true, true)).toBe(liveTranscriptCopy.processing);
  });
});
