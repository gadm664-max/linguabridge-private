export function buildInviteShareMessage(webBaseUrl: string, inviteCode: string, title?: string) {
  const origin = webBaseUrl.replace(/\/+$/, "");
  const safeTitle = title?.trim() || "اجتماع LinguaBridge";
  return `دعوة إلى ${safeTitle}\n${origin}/join/${inviteCode}`;
}
