/**
 * Voice transcription helper using internal Speech-to-Text service
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Upload audio to storage (e.g., S3) to get URL
 * 3. Call transcription with the URL
 *
 * Example usage:
 * ```tsx
 * // Frontend component
 * const transcribeMutation = trpc.voice.transcribe.useMutation({
 *   onSuccess: (data) => {
 *     console.log(data.text); // Full transcription
 *     console.log(data.language); // Detected language
 *     console.log(data.segments); // Timestamped segments
 *   }
 * });
 *
 * // After uploading audio to storage
 * transcribeMutation.mutate({
 *   audioUrl: uploadedAudioUrl,
 *   language: 'en', // optional
 *   prompt: 'Transcribe the meeting' // optional
 * });
 * ```
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "AUTHENTICATION_FAILED"
    | "NETWORK_FAILURE"
    | "MALFORMED_RESPONSE";
  details?: string;
  retryAfterMs?: number;
};

const TRANSCRIPTION_TIMEOUT_MS = 20_000;

export type TranscribeBufferOptions = {
  audio: Buffer;
  mimeType: string;
  language?: string;
  prompt?: string;
};

/**
 * Transcribe audio to text using the internal Speech-to-Text service
 *
 * @param options - Audio data and metadata
 * @returns Transcription result or error
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Step 1: Validate environment configuration
    if (!ENV.forgeApiUrl) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
      };
    }
    if (!ENV.forgeApiKey) {
      return {
        error: "Voice transcription service authentication is missing",
        code: "SERVICE_ERROR",
      };
    }

    // Step 2: Download audio from URL
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl, {
        signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
      });
      if (!response.ok) {
        return {
          error: "Failed to download audio file",
          code: response.status === 429 ? "RATE_LIMITED" : "INVALID_FORMAT",
        };
      }

      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type") || "audio/mpeg";

      // Check file size (16MB limit)
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`,
        };
      }
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      return {
        error: timedOut
          ? "Audio download timed out"
          : "Failed to fetch audio file",
        code: timedOut ? "TIMEOUT" : "NETWORK_FAILURE",
      };
    }

    return transcribeAudioBuffer({
      audio: audioBuffer,
      mimeType,
      language: options.language,
      prompt: options.prompt,
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      error: timedOut
        ? "Voice transcription timed out"
        : "Voice transcription failed",
      code: timedOut ? "TIMEOUT" : "NETWORK_FAILURE",
    };
  }
}

export async function transcribeAudioBuffer(
  options: TranscribeBufferOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
      };
    }
    if (!options.audio.length || options.audio.length > 16 * 1024 * 1024) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
      };
    }

    // Create FormData for multipart upload to Whisper API
    const formData = new FormData();

    // Create a Blob from the buffer and append to form
    const filename = `audio.${getFileExtension(options.mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(options.audio)], {
      type: options.mimeType,
    });
    formData.append("file", audioBlob, filename);

    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    // Add prompt - use custom prompt if provided, otherwise generate based on language
    const prompt =
      options.prompt ||
      (options.language
        ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
        : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);

    // Step 4: Call the transcription service
    const baseUrl = ENV.forgeApiUrl.endsWith("/")
      ? ENV.forgeApiUrl
      : `${ENV.forgeApiUrl}/`;

    const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
      signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs =
        retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : undefined;
      if (response.status === 401 || response.status === 403) {
        return {
          error: "Transcription service authentication failed",
          code: "AUTHENTICATION_FAILED",
        };
      }
      if (response.status === 429) {
        return {
          error: "Transcription service rate limit exceeded",
          code: "RATE_LIMITED",
          retryAfterMs,
        };
      }
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
      };
    }

    // Step 5: Parse and return the transcription result
    let whisperResponse: WhisperResponse;
    try {
      whisperResponse = (await response.json()) as WhisperResponse;
    } catch {
      return {
        error: "Invalid transcription response",
        code: "MALFORMED_RESPONSE",
      };
    }

    // Validate response structure
    if (
      !whisperResponse ||
      typeof whisperResponse.text !== "string" ||
      !whisperResponse.text.trim() ||
      typeof whisperResponse.language !== "string" ||
      typeof whisperResponse.duration !== "number" ||
      !Array.isArray(whisperResponse.segments)
    ) {
      return {
        error: "Invalid transcription response",
        code: "MALFORMED_RESPONSE",
      };
    }

    return whisperResponse; // Return native Whisper API response directly
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      error: timedOut
        ? "Voice transcription timed out"
        : "Voice transcription failed",
      code: timedOut ? "TIMEOUT" : "NETWORK_FAILURE",
    };
  }
}

/**
 * Helper function to get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };

  return mimeToExt[mimeType] || "audio";
}

/**
 * Helper function to get full language name from ISO code
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    hi: "Hindi",
    nl: "Dutch",
    pl: "Polish",
    tr: "Turkish",
    sv: "Swedish",
    da: "Danish",
    no: "Norwegian",
    fi: "Finnish",
  };

  return langMap[langCode] || langCode;
}

/**
 * Example tRPC procedure implementation:
 *
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 *
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioUrl: z.string(),
 *       language: z.string().optional(),
 *       prompt: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio(input);
 *
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         audioUrl: input.audioUrl,
 *         createdAt: new Date(),
 *       });
 *
 *       return result;
 *     }),
 * });
 * ```
 */
