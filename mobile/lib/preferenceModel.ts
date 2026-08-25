import { defaultVoiceRate, normalizeVoiceRate, supportedLanguages } from "@linguabridge/contracts/meetingSpecs";

const languageCodes = new Set<string>(supportedLanguages.map(language => language.code));

export type MobilePreferences = {
  speechLanguage: string;
  displayLanguage: string;
  voiceRate: number;
  askBeforeStorage: boolean;
  meetingReminders: boolean;
};

export const defaultMobilePreferences: MobilePreferences = {
  speechLanguage: "ar",
  displayLanguage: "en",
  voiceRate: defaultVoiceRate,
  askBeforeStorage: true,
  meetingReminders: true,
};

export function normalizeMobilePreferences(value: unknown): MobilePreferences {
  if (!value || typeof value !== "object") return defaultMobilePreferences;
  const input = value as Partial<MobilePreferences>;
  const rate = typeof input.voiceRate === "number" && Number.isFinite(input.voiceRate) ? input.voiceRate : defaultMobilePreferences.voiceRate;
  return {
    speechLanguage: typeof input.speechLanguage === "string" && languageCodes.has(input.speechLanguage) ? input.speechLanguage : defaultMobilePreferences.speechLanguage,
    displayLanguage: typeof input.displayLanguage === "string" && languageCodes.has(input.displayLanguage) ? input.displayLanguage : defaultMobilePreferences.displayLanguage,
    voiceRate: normalizeVoiceRate(rate),
    askBeforeStorage: typeof input.askBeforeStorage === "boolean" ? input.askBeforeStorage : defaultMobilePreferences.askBeforeStorage,
    meetingReminders: typeof input.meetingReminders === "boolean" ? input.meetingReminders : defaultMobilePreferences.meetingReminders,
  };
}
