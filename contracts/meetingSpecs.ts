export const supportedLanguages = [
  { code: "ar", value: "ar", label: "العربية", locale: "ar-SA", direction: "rtl" },
  { code: "en", value: "en", label: "English", locale: "en-US", direction: "ltr" },
  { code: "fr", value: "fr", label: "Français", locale: "fr-FR", direction: "ltr" },
  { code: "es", value: "es", label: "Español", locale: "es-ES", direction: "ltr" },
  { code: "de", value: "de", label: "Deutsch", locale: "de-DE", direction: "ltr" },
  { code: "it", value: "it", label: "Italiano", locale: "it-IT", direction: "ltr" },
  { code: "pt", value: "pt", label: "Português", locale: "pt-PT", direction: "ltr" },
  { code: "tr", value: "tr", label: "Türkçe", locale: "tr-TR", direction: "ltr" },
  { code: "ja", value: "ja", label: "日本語", locale: "ja-JP", direction: "ltr" },
  { code: "ko", value: "ko", label: "한국어", locale: "ko-KR", direction: "ltr" },
  { code: "zh", value: "zh", label: "中文", locale: "zh-CN", direction: "ltr" },
] as const;

export type MeetingLanguageCode = (typeof supportedLanguages)[number]["code"];
export type MeetingStatus = "lobby" | "active" | "ended";

export const supportedVoiceRates = [
  { value: 0.7, label: "0.7× بطيئة" },
  { value: 0.8, label: "0.8× بطيئة" },
  { value: 0.9, label: "0.9× هادئة" },
  { value: 1, label: "1.0× عادية" },
  { value: 1.1, label: "1.1× سريعة" },
  { value: 1.2, label: "1.2× سريعة" },
  { value: 1.3, label: "1.3× سريعة" },
  { value: 1.4, label: "1.4× سريعة" },
] as const;

export const defaultVoiceRate = 1;

export function normalizeVoiceRate(value: number) {
  return Math.max(0.7, Math.min(value, 1.4));
}

export const supportedVoiceProfiles = [
  { value: "natural", label: "نمط طبيعي" },
  { value: "warm", label: "نمط دافئ" },
  { value: "clear", label: "نمط واضح" },
] as const;

export type VoiceProfileCode = (typeof supportedVoiceProfiles)[number]["value"];
export const defaultVoiceProfile = "natural" satisfies VoiceProfileCode;

export function normalizeVoiceProfile(value: unknown): VoiceProfileCode {
  return typeof value === "string" && supportedVoiceProfiles.some(profile => profile.value === value)
    ? value as VoiceProfileCode
    : defaultVoiceProfile;
}

export const meetingPrivacyDefaults = {
  confirmStoragePerMeeting: true,
  meetingReminders: true,
  requiresExplicitConsent: true,
  requiresAllActiveParticipants: true,
  requiresUnanimousActiveParticipantConsent: true,
} as const;

export const lobbyReadinessCopy = {
  microphone: {
    title: "جاهزية الميكروفون",
    untested: "اختبر الميكروفون قبل الدخول",
    testing: "اختبار الإشارة جارٍ…",
    ready: "تم اختبار الميكروفون بنجاح",
    muted: "الميكروفون موقوف مؤقتًا",
    testAction: "اختبار الميكروفون",
  },
  invite: {
    title: "إرسال رابط دعوة",
    enabled: "يمكنك نسخ الرابط ومشاركته بعد فتح الجلسة.",
    disabled: "لن تُعرض أدوات مشاركة الرابط في هذه الجلسة؛ يظل رمز الانضمام صالحًا للمشاركين المصرح لهم.",
  },
  consent: {
    title: "أوافق على حفظ النص المترجم ومحضر الاجتماع.",
    required: "يلزم تأكيد موافقتك قبل حفظ محتوى هذه الجلسة.",
    detail: "لن يُحفظ المحتوى إلا عند موافقتك وموافقة جميع المشاركين الحاضرين.",
  },
} as const;

export type LobbyInviteState = "enabled" | "disabled";

export function getLobbyInviteGuidance(enabled: boolean) {
  return lobbyReadinessCopy.invite[enabled ? "enabled" : "disabled"];
}

export const meetingStateLabels: Record<MeetingStatus, string> = {
  lobby: "في الردهة",
  active: "نشطة",
  ended: "انتهت",
};

export const microphoneMuteControlCopy = {
  unmuted: { label: "كتم الصوت", active: false },
  muted: { label: "إلغاء كتم الصوت", active: true },
} as const;

export function getMicrophoneMuteControlCopy(muted: boolean) {
  return microphoneMuteControlCopy[muted ? "muted" : "unmuted"];
}

export type LiveTranscriptionState = "idle" | "listening" | "processing";

export const liveTranscriptionStatusCopy: Record<LiveTranscriptionState, string> = {
  idle: "النص الحي متوقف",
  listening: "النص الحي يعمل",
  processing: "جارٍ النسخ والترجمة…",
};

export function getLiveTranscriptionStatus(state: LiveTranscriptionState) {
  return liveTranscriptionStatusCopy[state];
}
