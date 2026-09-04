export function requireInviteCode(inviteCode: string | undefined) {
  const normalized = inviteCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z2-9]{6,16}$/.test(normalized)) {
    throw new Error("أنشئ اجتماعًا أو انضم إليه عبر رابط دعوة صالح أولًا.");
  }
  return normalized;
}

export function canProcessMeetingAudio(input: {
  inviteCode?: string;
  hasRecordingUri: boolean;
  hasStorageConsent: boolean;
}) {
  if (!input.hasRecordingUri) return { allowed: false, reason: "لا يوجد مقطع صوتي لمعالجته." } as const;
  try {
    requireInviteCode(input.inviteCode);
  } catch (error) {
    return { allowed: false, reason: error instanceof Error ? error.message : "رابط الدعوة غير صالح." } as const;
  }
  if (!input.hasStorageConsent) {
    return { allowed: false, reason: "تحتاج معالجة الصوت إلى موافقة الحفظ في الاجتماع." } as const;
  }
  return { allowed: true } as const;
}
