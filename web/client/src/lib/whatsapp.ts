export function buildWhatsAppShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text.trim())}`;
}

export function buildMeetingInviteShare(origin: string, inviteCode: string, title?: string) {
  const safeTitle = title?.trim() || "اجتماع LinguaBridge";
  return buildWhatsAppShareUrl(`دعوة إلى ${safeTitle}\n${origin}/join/${inviteCode}`);
}

export function buildMinutesShare(origin: string, inviteCode: string, title?: string) {
  const safeTitle = title?.trim() || "محضر اجتماع LinguaBridge";
  return buildWhatsAppShareUrl(`رابط مراجعة ${safeTitle}\n${origin}/minutes/${inviteCode}\nيتطلب الرابط صلاحية وصول للاطلاع على المحتوى.`);
}
