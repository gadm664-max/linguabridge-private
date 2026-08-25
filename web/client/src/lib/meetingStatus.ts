import { meetingStateLabels, type MeetingStatus } from "@shared/meetingSpecs";

export function getMeetingStatusLabel(status: string) {
  return meetingStateLabels[status as MeetingStatus] ?? "حالة غير معروفة";
}
