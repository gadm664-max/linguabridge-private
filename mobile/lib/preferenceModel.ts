const languageCodes = new Set(["ar", "en", "fr", "es", "de", "it", "pt", "tr", "ja", "ko", "zh"]);

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
  voiceRate: 1,
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
    voiceRate: Math.max(0.7, Math.min(rate, 1.4)),
    askBeforeStorage: typeof input.askBeforeStorage === "boolean" ? input.askBeforeStorage : defaultMobilePreferences.askBeforeStorage,
    meetingReminders: typeof input.meetingReminders === "boolean" ? input.meetingReminders : defaultMobilePreferences.meetingReminders,
  };
}
