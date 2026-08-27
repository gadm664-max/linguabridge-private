import { AccessToken } from "livekit-server-sdk";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appendTranscriptSegment, getMeetingForInvite, isActiveMeetingParticipant, isMeetingPersistenceAllowed } from "../db";
import { ENV } from "../_core/env";
import { transcribeAudio } from "../_core/voiceTranscription";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { translateMeetingText } from "../services/translationService";

const languageCode = z.string().trim().min(2).max(16);
const audioMimeType = z.enum(["audio/m4a", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]);
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

const mimeExtensions: Record<z.infer<typeof audioMimeType>, string> = {
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

export function decodeBase64Audio(payload: string) {
  const normalized = payload.replace(/\s/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid audio payload" });
  }
  const data = Buffer.from(normalized, "base64");
  if (!data.length || data.length > MAX_AUDIO_BYTES) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Audio clip must be no larger than 16MB" });
  }
  return data;
}

export function roomNameForMeeting(meetingId: number) {
  return `linguabridge-meeting-${meetingId}`;
}

export function requireRealtimeConsent(persistenceAllowed: boolean) {
  if (!persistenceAllowed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "All active participants must consent before joining live audio",
    });
  }
}

function realtimeConfig() {
  const serverUrl = ENV.livekitUrl;
  const apiKey = ENV.livekitApiKey;
  const apiSecret = ENV.livekitApiSecret;
  return {
    serverUrl,
    apiKey,
    apiSecret,
    configured: Boolean(serverUrl && apiKey && apiSecret),
  };
}

export async function requireActiveParticipant(inviteCode: string, userId: number) {
  const meeting = await getMeetingForInvite(inviteCode);
  if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
  if (!(await isActiveMeetingParticipant(meeting.id, userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Join the meeting before using live services" });
  }
  return meeting;
}

export const mobileRouter = router({
  capabilities: publicProcedure.query(() => {
    const realtime = realtimeConfig();
    return {
      apiVersion: 1,
      transcriptionEnabled: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey),
      managedRealtimeEnabled: realtime.configured,
      directPeerPreviewEnabled: false,
    };
  }),

  transcribeAndTranslate: protectedProcedure.input(z.object({
    inviteCode: z.string().trim().toUpperCase().max(16),
    audioBase64: z.string().min(4).max(23_000_000),
    mimeType: audioMimeType,
    sourceLanguage: languageCode,
    targetLanguage: languageCode,
  })).mutation(async ({ ctx, input }) => {
    const meeting = await requireActiveParticipant(input.inviteCode, ctx.user.id);
    if (!(await isMeetingPersistenceAllowed(meeting.id))) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "All active participants must consent before audio is processed or saved",
      });
    }

    const audio = decodeBase64Audio(input.audioBase64);
    const extension = mimeExtensions[input.mimeType];
    const uploaded = await storagePut(
      `meeting-audio/${meeting.id}/${ctx.user.id}/${crypto.randomUUID()}.${extension}`,
      audio,
      input.mimeType,
    );
    const audioUrl = await storageGetSignedUrl(uploaded.key);
    const transcription = await transcribeAudio({ audioUrl, language: input.sourceLanguage });
    if ("error" in transcription) {
      throw new TRPCError({ code: "BAD_GATEWAY", message: transcription.error });
    }
    const translated = await translateMeetingText({
      text: transcription.text,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    });
    await appendTranscriptSegment({
      meetingId: meeting.id,
      userId: ctx.user.id,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      originalText: transcription.text,
      translatedText: translated.translation,
    });

    return {
      originalText: transcription.text,
      translatedText: translated.translation,
      detectedLanguage: transcription.language,
      durationSeconds: transcription.duration,
      segments: transcription.segments.map(segment => ({
        start: segment.start,
        end: segment.end,
        text: segment.text,
      })),
      translationModel: translated.model,
    };
  }),

  realtime: router({
    status: publicProcedure.query(() => {
      const realtime = realtimeConfig();
      return {
        managedRealtimeEnabled: realtime.configured,
        directPeerPreviewEnabled: false,
        roomProvider: realtime.configured ? "livekit" : "not-configured",
      } as const;
    }),

    issueRoomToken: protectedProcedure.input(z.object({
      inviteCode: z.string().trim().toUpperCase().max(16),
    })).mutation(async ({ ctx, input }) => {
      const meeting = await requireActiveParticipant(input.inviteCode, ctx.user.id);
      requireRealtimeConsent(await isMeetingPersistenceAllowed(meeting.id));
      const realtime = realtimeConfig();
      if (!realtime.configured || !realtime.serverUrl || !realtime.apiKey || !realtime.apiSecret) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Managed realtime is not configured yet",
        });
      }

      const token = new AccessToken(realtime.apiKey, realtime.apiSecret, {
        identity: `user-${ctx.user.id}`,
        name: ctx.user.name || "مشارك LinguaBridge",
        ttl: "10m",
      });
      token.addGrant({
        roomJoin: true,
        room: roomNameForMeeting(meeting.id),
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      return {
        serverUrl: realtime.serverUrl,
        roomName: roomNameForMeeting(meeting.id),
        participantToken: await token.toJwt(),
        expiresInSeconds: 600,
      };
    }),
  }),
});
