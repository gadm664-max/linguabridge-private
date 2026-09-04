import { meetingStateLabels, type MeetingStatus } from "./specs";

export function getNativeMeetingStatusLabel(status: string) {
  return meetingStateLabels[status as MeetingStatus] ?? "حالة غير معروفة";
}
