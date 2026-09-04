type ExportAccount = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  createdAt: Date;
};

type ExportPreference = {
  speakingLanguage: string;
  displayLanguage: string;
  voiceName: string;
  voiceRate: string;
  confirmStoragePerMeeting: boolean;
  meetingReminders: boolean;
  updatedAt: Date;
} | null;

type ExportMeeting = {
  meetingId: number;
  title: string;
  status: "lobby" | "active" | "ended";
  meetingCreatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  joinedAt: Date;
  leftAt: Date | null;
  speakingLanguage: string;
  displayLanguage: string;
  voiceName: string;
  voiceRate: string;
  storageConsent: boolean;
};

export function buildUserDataExport(account: ExportAccount, preferences: ExportPreference, meetings: ExportMeeting[]) {
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    scope: "This export contains account profile, saved preferences, and the requesting user's own meeting participation metadata. It excludes other participants, recordings, message content, and shared transcripts.",
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: account.createdAt,
    },
    preferences,
    meetingParticipation: meetings,
  };
}
