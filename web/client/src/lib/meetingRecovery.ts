export const meetingInviteNotFoundMessage = "تعذر العثور على رابط الدعوة. تحقق من الرمز أو أنشئ اجتماعًا جديدًا.";

export function getMeetingInviteRecoveryPath() {
  return "/lobby";
}

export function shouldRecoverFromMeetingInviteError(code: string | undefined) {
  return code === "NOT_FOUND";
}
