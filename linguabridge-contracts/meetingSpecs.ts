export const supportedLanguages = [
  { code: "ar", value: "ar", label: "العربية", locale: "ar-SA", direction: "rtl" },
  { code: "en", value: "en", label: "English", locale: "en-US", direction: "ltr" },
  { code: "fr", value: "fr", label: "Français", locale: "fr-FR", direction: "ltr" },
  { code: "es", value: "es", label: "Español", locale: "es-ES", direction: "ltr" },
  { code: "ja", value: "ja", label: "日本語", locale: "ja-JP", direction: "ltr" },
] as const;

export type MeetingLanguageCode = (typeof supportedLanguages)[number]["code"];
export type MeetingStatus = "lobby" | "active" | "ended";

export const meetingPrivacyDefaults = {
  confirmStoragePerMeeting: true,
  meetingReminders: true,
  requiresExplicitConsent: true,
  requiresAllActiveParticipants: true,
  requiresUnanimousActiveParticipantConsent: true,
} as const;

export const meetingStateLabels: Record<MeetingStatus, string> = {
  lobby: "في الردهة",
  active: "نشطة",
  ended: "انتهت",
};
