import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createConfiguredSpeechProvider,
  SpeechServiceError,
  speechToTextLimits,
} from "../server/services/speechToTextService";
import {
  translateMeetingText,
  TranslationServiceError,
} from "../server/services/translationService";

const requiredLanguages = ["ar", "es", "en"] as const;
type RequiredLanguage = (typeof requiredLanguages)[number];

const mimeTypes: Record<string, string> = {
  ".m4a": "audio/m4a",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

type SmokeResult = {
  provider: string;
  model: string;
  language: RequiredLanguage;
  audioFormat: string;
  audioDurationSeconds: number | null;
  firstPartialLatencyMs: number | null;
  finalTranscriptLatencyMs: number | null;
  success: boolean;
  transcript: string | null;
  transcriptLength: number | null;
  detectedLanguage?: string;
  errorCode?: string;
};

function notRun(reason: string): never {
  console.log(`REAL PROVIDER TEST = NOT RUN — ${reason}`);
  process.exit(0);
}

function audioPathForLanguage(language: RequiredLanguage) {
  const languageSpecific =
    process.env[`STT_SMOKE_AUDIO_${language.toUpperCase()}`];
  return languageSpecific || process.env.STT_SMOKE_AUDIO_FILE || "";
}

function includeTranscript() {
  return process.env.STT_SMOKE_INCLUDE_TRANSCRIPT === "true";
}

function mimeTypeForPath(audioPath: string) {
  return (
    process.env.STT_SMOKE_MIME_TYPE ||
    mimeTypes[extname(audioPath).toLowerCase()]
  );
}

async function readFixture(audioPath: string) {
  const audio = await readFile(audioPath);
  if (!audio.length || audio.length > speechToTextLimits.maxChunkBytes) {
    notRun("AUDIO FIXTURE IS EMPTY OR EXCEEDS 16MB");
  }
  const mimeType = mimeTypeForPath(audioPath);
  if (!mimeType) notRun("SUPPORTED AUDIO MIME TYPE NOT PROVIDED");
  return { audio, mimeType };
}

async function main() {
  if (
    !process.env.BUILT_IN_FORGE_API_URL ||
    !process.env.BUILT_IN_FORGE_API_KEY
  ) {
    notRun("CREDENTIALS NOT CONFIGURED");
  }

  const fixturePaths = Object.fromEntries(
    requiredLanguages.map(language => [
      language,
      audioPathForLanguage(language),
    ])
  ) as Record<RequiredLanguage, string>;
  const missingLanguages = requiredLanguages.filter(
    language => !fixturePaths[language]
  );
  if (missingLanguages.length) {
    notRun(`AUDIO FIXTURES NOT PROVIDED FOR: ${missingLanguages.join(", ")}`);
  }

  const provider = createConfiguredSpeechProvider();
  const showTranscript = includeTranscript();
  const results: SmokeResult[] = [];
  const audioByLanguage = new Map<
    RequiredLanguage,
    { audio: Buffer; mimeType: string }
  >();

  for (const language of requiredLanguages) {
    const { audio, mimeType } = await readFixture(fixturePaths[language]);
    audioByLanguage.set(language, { audio, mimeType });
    const startedAt = performance.now();
    try {
      const result = await provider.transcribeChunk({
        audio,
        mimeType,
        language,
        context:
          "Controlled STT smoke test. Transcribe only the spoken content.",
      });
      results.push({
        provider: provider.name,
        model: provider.model,
        language,
        audioFormat: mimeType,
        audioDurationSeconds: result.duration,
        firstPartialLatencyMs: null,
        finalTranscriptLatencyMs: Math.round(performance.now() - startedAt),
        success: true,
        transcript: showTranscript ? result.text : null,
        transcriptLength: result.text.length,
        detectedLanguage: result.language,
      });
    } catch (error) {
      const serviceError =
        error instanceof SpeechServiceError ? error : undefined;
      results.push({
        provider: provider.name,
        model: provider.model,
        language,
        audioFormat: mimeType,
        audioDurationSeconds: null,
        firstPartialLatencyMs: null,
        finalTranscriptLatencyMs: null,
        success: false,
        transcript: null,
        transcriptLength: null,
        errorCode: serviceError?.code || "PROVIDER_FAILURE",
      });
    }
  }

  const endToEnd = await runArabicToSpanishChain(
    provider,
    results,
    audioByLanguage.get("ar"),
    showTranscript
  );

  console.log(
    JSON.stringify(
      {
        realProviderTest: {
          provider: provider.name,
          results,
          partialSupport: "not_available_for_chunk_provider",
        },
        arabicToSpanish: endToEnd,
      },
      null,
      2
    )
  );
  if (results.some(result => !result.success) || !endToEnd.success)
    process.exitCode = 1;
}

async function runArabicToSpanishChain(
  provider: ReturnType<typeof createConfiguredSpeechProvider>,
  results: SmokeResult[],
  arabicFixture: { audio: Buffer; mimeType: string } | undefined,
  showTranscript: boolean
) {
  if (!arabicFixture || results.some(result => !result.success)) {
    return {
      success: false,
      skipped: true,
      reason:
        "STT must succeed for Arabic, Spanish, and English before the controlled chain runs",
      provider: provider.name,
      model: provider.model,
    };
  }

  const sttStartedAt = performance.now();
  let transcript: string;
  try {
    const transcription = await provider.transcribeChunk({
      audio: arabicFixture.audio,
      mimeType: arabicFixture.mimeType,
      language: "ar",
      context: "Controlled Arabic to Spanish end-to-end smoke test.",
    });
    transcript = transcription.text;
  } catch (error) {
    return {
      success: false,
      skipped: false,
      provider: provider.name,
      model: provider.model,
      errorCode:
        error instanceof SpeechServiceError ? error.code : "STT_FAILURE",
    };
  }
  const sttLatencyMs = Math.round(performance.now() - sttStartedAt);

  const translationStartedAt = performance.now();
  try {
    const translation = await translateMeetingText({
      text: transcript,
      sourceLanguage: "ar",
      targetLanguage: "es",
    });
    const translationLatencyMs = Math.round(
      performance.now() - translationStartedAt
    );
    return {
      success: true,
      skipped: false,
      provider: provider.name,
      model: provider.model,
      sttLatencyMs,
      translationLatencyMs,
      totalLatencyMs: sttLatencyMs + translationLatencyMs,
      originalTranscript: showTranscript ? transcript : null,
      translatedResult: showTranscript ? translation.translation : null,
      originalTranscriptLength: transcript.length,
      translatedResultLength: translation.translation.length,
      translationProvider: translation.provider,
      translationModel: translation.model,
    };
  } catch (error) {
    return {
      success: false,
      skipped: false,
      provider: provider.name,
      model: provider.model,
      sttLatencyMs,
      translationLatencyMs: null,
      totalLatencyMs: null,
      errorCode:
        error instanceof TranslationServiceError
          ? error.code
          : "TRANSLATION_FAILURE",
    };
  }
}

main().catch(error => {
  console.error(
    JSON.stringify({
      success: false,
      errorCode:
        error instanceof SpeechServiceError ? error.code : "SMOKE_TEST_FAILURE",
    })
  );
  process.exitCode = 1;
});
