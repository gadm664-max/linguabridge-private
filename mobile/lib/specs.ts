export {
  getLiveTranscriptionControlCopy,
  getLiveTranscriptionStatus,
  getLobbyInviteGuidance,
  getMicrophoneMuteControlCopy,
  lobbyReadinessCopy,
  meetingStateLabels,
  meetingPrivacyDefaults,
  supportedLanguages,
  supportedVoiceProfiles,
  supportedVoiceRates,
} from "@linguabridge/contracts/meetingSpecs";

export type LanguageCode = import("@linguabridge/contracts/meetingSpecs").MeetingLanguageCode;
export type MeetingStatus = import("@linguabridge/contracts/meetingSpecs").MeetingStatus;

export function getInviteSharingSessionParam(enabled: boolean) {
  return enabled ? "1" : "0";
}
