export const meetingInviteNotFoundMessage = "تعذر العثور على رابط الدعوة. يمكنك العودة إلى الردهة وبدء اجتماعًا جديدًا أو طلب رابط محدث.";

export function getMeetingInviteRecoveryPath() {
  return "/lobby";
}

export function shouldRecoverFromMeetingInviteError(code: string | undefined) {
  return code === "NOT_FOUND";
}
