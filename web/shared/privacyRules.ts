export function canPersistMeetingContent(input: { meetingStorageConsent: boolean; activeParticipantConsents: boolean[] }) {
  return input.meetingStorageConsent && input.activeParticipantConsents.length > 0 && input.activeParticipantConsents.every(Boolean);
}
