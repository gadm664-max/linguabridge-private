import * as FileSystem from "expo-file-system/legacy";
import { getApi } from "./api";
import { requireInviteCode } from "./meetingGuards";

export type MeetingBootstrap = {
  inviteCode: string;
  title: string;
  status: string;
  inviteSharingEnabled: boolean;
};

export type MeetingInviteDetails = MeetingBootstrap & {
  storageConsent: boolean;
};

export async function createNativeMeeting(input: {
  title: string;
  speakingLanguage: string;
  displayLanguage: string;
  storageConsent: boolean;
  inviteSharingEnabled: boolean;
  voiceName: string;
  voiceRate: string;
}) {
  return getApi().meetings.create.mutate({
    ...input,
  }) as Promise<MeetingBootstrap>;
}

export async function getNativeMeetingForInvite(inviteCode: string) {
  return getApi().meetings.byInvite.query({
    inviteCode: requireInviteCode(inviteCode),
  }) as Promise<MeetingInviteDetails>;
}

export async function transcribeRecording(input: {
  recordingUri: string;
  inviteCode: string;
  sourceLanguage: string;
  targetLanguage: string;
  mimeType?: "audio/m4a" | "audio/mp4" | "audio/mpeg" | "audio/ogg" | "audio/wav" | "audio/webm";
}) {
  const audioBase64 = await FileSystem.readAsStringAsync(input.recordingUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return getApi().mobile.transcribeAndTranslate.mutate({
    inviteCode: requireInviteCode(input.inviteCode),
    audioBase64,
    mimeType: input.mimeType ?? "audio/m4a",
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
  }) as Promise<{
    originalText: string;
    translatedText: string;
    detectedLanguage: string;
    durationSeconds: number;
  }>;
}

export async function getRealtimeStatus() {
  return getApi().mobile.realtime.status.query() as Promise<{
    managedRealtimeEnabled: boolean;
    directPeerPreviewEnabled: boolean;
    roomProvider: string;
  }>;
}

export async function issueManagedRoomToken(inviteCode: string) {
  return getApi().mobile.realtime.issueRoomToken.mutate({ inviteCode: requireInviteCode(inviteCode) }) as Promise<{
    serverUrl: string;
    roomName: string;
    participantToken: string;
    expiresInSeconds: number;
  }>;
}
