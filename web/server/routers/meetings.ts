import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appendTranscriptSegment, createMeeting, getMeetingForInvite, getUserPreferences, inviteCodeExists, isMeetingPersistenceAllowed, joinMeeting, listMeetingsForHost, saveUserPreferences } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { buildInvitePath, createInviteCode, isValidInviteCode } from "../../shared/meetingUtils";

const languageCode = z.string().trim().min(2).max(16);
const preferencesInput = z.object({
  speakingLanguage: languageCode,
  displayLanguage: languageCode,
  voiceName: z.string().trim().min(1).max(64),
  voiceRate: z.string().regex(/^0\.[7-9]|1\.[0-4]$/, "Voice rate must be between 0.7 and 1.4"),
  confirmStoragePerMeeting: z.boolean(),
  meetingReminders: z.boolean(),
});

async function uniqueInviteCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createInviteCode();
    if (!(await inviteCodeExists(code))) return code;
  }
  throw new TRPCError({ code: "CONFLICT", message: "Could not reserve a unique invitation code" });
}

export const meetingsRouter = router({
  create: protectedProcedure.input(z.object({
    title: z.string().trim().min(2).max(160),
    storageConsent: z.boolean(),
    speakingLanguage: languageCode,
    displayLanguage: languageCode,
    voiceName: z.string().trim().min(1).max(64).default("natural"),
    voiceRate: z.string().regex(/^0\.[7-9]|1\.[0-4]$/).default("1.0"),
  })).mutation(async ({ ctx, input }) => {
    const inviteCode = await uniqueInviteCode();
    const meeting = await createMeeting({
      hostUserId: ctx.user.id,
      inviteCode,
      title: input.title,
      storageConsent: input.storageConsent,
      hostName: ctx.user.name || "مضيف الاجتماع",
      speakingLanguage: input.speakingLanguage,
      displayLanguage: input.displayLanguage,
      voiceName: input.voiceName,
      voiceRate: input.voiceRate,
    });
    return { ...meeting, invitePath: buildInvitePath(inviteCode) };
  }),

  byInvite: publicProcedure.input(z.object({ inviteCode: z.string().trim().toUpperCase().max(16) })).query(async ({ input }) => {
    if (!isValidInviteCode(input.inviteCode)) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    const meeting = await getMeetingForInvite(input.inviteCode);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    return meeting;
  }),

  join: protectedProcedure.input(z.object({
    inviteCode: z.string().trim().toUpperCase().max(16),
    speakingLanguage: languageCode,
    displayLanguage: languageCode,
    voiceName: z.string().trim().min(1).max(64).default("natural"),
    voiceRate: z.string().regex(/^0\.[7-9]|1\.[0-4]$/).default("1.0"),
    storageConsent: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    if (!isValidInviteCode(input.inviteCode)) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    const meeting = await joinMeeting({ ...input, userId: ctx.user.id, displayName: ctx.user.name || "مشارك" });
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    return { ...meeting, invitePath: buildInvitePath(input.inviteCode) };
  }),

  privacyStatus: protectedProcedure.input(z.object({ inviteCode: z.string().trim().toUpperCase().max(16) })).query(async ({ input }) => {
    const meeting = await getMeetingForInvite(input.inviteCode);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    return { storageRequested: meeting.storageConsent, persistenceAllowed: await isMeetingPersistenceAllowed(meeting.id) };
  }),

  saveSegment: protectedProcedure.input(z.object({
    inviteCode: z.string().trim().toUpperCase().max(16),
    sourceLanguage: languageCode,
    targetLanguage: languageCode,
    originalText: z.string().trim().min(1).max(4000),
    translatedText: z.string().trim().min(1).max(4000),
  })).mutation(async ({ ctx, input }) => {
    const meeting = await getMeetingForInvite(input.inviteCode);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
    try {
      return await appendTranscriptSegment({ ...input, meetingId: meeting.id, userId: ctx.user.id });
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Transcript could not be saved" });
    }
  }),

  history: protectedProcedure.query(({ ctx }) => listMeetingsForHost(ctx.user.id)),

  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => getUserPreferences(ctx.user.id)),
    save: protectedProcedure.input(preferencesInput).mutation(async ({ ctx, input }) => {
      const saved = await saveUserPreferences(ctx.user.id, input);
      if (!saved) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Preferences could not be saved" });
      return saved;
    }),
  }),
});
