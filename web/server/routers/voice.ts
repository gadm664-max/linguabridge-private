import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { decodeBase64Audio, requireActiveParticipant } from "./mobile";
import { isMeetingPersistenceAllowed } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  SpeechServiceError,
  transcribeChunk,
} from "../services/speechToTextService";
import {
  TranslationServiceError,
  translateMeetingText,
} from "../services/translationService";

const audioMimeType = z.enum([
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const languageCode = z.string().trim().min(2).max(16);
const inviteCode = z.string().trim().toUpperCase().min(4).max(16);
const MAX_BASE64_CHUNK_LENGTH = 8_000_000;

function toTrpcCode(
  statusCode: number
):
  | "BAD_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "TOO_MANY_REQUESTS"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT" {
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode === 429) return "TOO_MANY_REQUESTS";
  if (statusCode === 503) return "SERVICE_UNAVAILABLE";
  if (statusCode === 504) return "TIMEOUT";
  return "BAD_GATEWAY";
}

function throwProviderError(
  error: SpeechServiceError | TranslationServiceError,
  response: { setHeader?: (name: string, value: string) => void }
) {
  if (error.retryAfterMs && response.setHeader) {
    response.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
    );
  }
  throw new TRPCError({
    code: toTrpcCode(error.statusCode),
    message: error.message,
  });
}

export const voiceRouter = router({
  transcribeAndTranslate: protectedProcedure
    .input(
      z.object({
        inviteCode,
        audioBase64: z.string().min(4).max(MAX_BASE64_CHUNK_LENGTH),
        mimeType: audioMimeType,
        sourceLanguage: languageCode,
        targetLanguage: languageCode,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireActiveParticipant(
        input.inviteCode,
        ctx.user.id
      );
      if (!(await isMeetingPersistenceAllowed(meeting.id))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "All active participants must consent before audio is processed",
        });
      }

      const audio = decodeBase64Audio(input.audioBase64);
      let transcription;
      try {
        transcription = await transcribeChunk({
          audio,
          mimeType: input.mimeType,
          language: input.sourceLanguage,
          context:
            "Transcribe this short meeting audio clip accurately. Return only spoken content.",
        });
      } catch (error) {
        if (error instanceof SpeechServiceError)
          throwProviderError(error, ctx.res);
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Speech-to-text service unavailable",
        });
      }

      if (!transcription.text.trim()) {
        return {
          originalText: "",
          translatedText: "",
          detectedLanguage: transcription.language,
          durationSeconds: transcription.duration,
          segments: [],
          provider: "speech-to-text",
          model: "whisper-1",
        };
      }

      let translated;
      try {
        translated = await translateMeetingText({
          text: transcription.text,
          sourceLanguage: input.sourceLanguage,
          targetLanguage: input.targetLanguage,
        });
      } catch (error) {
        if (error instanceof TranslationServiceError)
          throwProviderError(error, ctx.res);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Translation service unavailable",
        });
      }

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
        provider: translated.provider,
        model: translated.model,
      };
    }),
});
