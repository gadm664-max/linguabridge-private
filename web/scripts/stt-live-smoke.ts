import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createConfiguredSpeechProvider,
  DeepgramSpeechProvider,
  SpeechServiceError,
  speechToTextLimits,
  type SpeechStreamingResult,
} from "../server/services/speechToTextService";
import {
  translateMeetingText,
  TranslationServiceError,
} from "../server/services/translationService";

const testCases = [
  { name: "arabic", language: "ar", envKey: "STT_SMOKE_AUDIO_AR" },
  {
    name: "arabic-egypt",
    language: "ar-EG",
    envKey: "STT_SMOKE_AUDIO_AR_EG",
  },
  { name: "spanish-spain", language: "es-ES", envKey: "STT_SMOKE_AUDIO_ES_ES" },
  { name: "english-us", language: "en-US", envKey: "STT_SMOKE_AUDIO_EN_US" },
] as const;
type SmokeCase = (typeof testCases)[number];

const mimeTypes: Record<string, string> = {
  ".m4a": "audio/m4a",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

type SmokeResult = {
  case: SmokeCase["name"];
  provider: string;
  model: string;
  requestedLanguage: string;
  providerLanguage: string;
  audioFormat: string;
  audioDurationSeconds: number | null;
  firstPartialLatencyMs: number | null;
  finalResultLatencyMs: number | null;
  success: boolean;
  transcript: string | null;
  transcriptLength: number | null;
  errorCode?: string;
};

function notRun(reason: string): never {
  console.log(`REAL_PROVIDER_VERIFIED = NO\nREASON = ${reason}`);
  process.exit(0);
}

function audioPathForCase(testCase: SmokeCase) {
  return (
    process.env[testCase.envKey] ||
    (testCase.name === "arabic" ? process.env.STT_SMOKE_AUDIO_FILE : "") ||
    ""
  );
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
    notRun("AUDIO_FIXTURE_EMPTY_OR_EXCEEDS_16MB");
  }
  const mimeType = mimeTypeForPath(audioPath);
  if (!mimeType) notRun("SUPPORTED_AUDIO_MIME_TYPE_NOT_PROVIDED");
  return { audio, mimeType };
}

async function main() {
  if (!process.env.DEEPGRAM_API_KEY) {
    notRun("DEEPGRAM_API_KEY_NOT_CONFIGURED");
  }

  const fixturePaths = testCases.map(testCase => ({
    testCase,
    path: audioPathForCase(testCase),
  }));
  const missingCases = fixturePaths
    .filter(({ path }) => !path)
    .map(({ testCase }) => testCase.name);
  if (missingCases.length) {
    notRun(`AUDIO_FIXTURES_NOT_PROVIDED_FOR_${missingCases.join("_")}`);
  }

  const provider = createConfiguredSpeechProvider();
  if (!(provider instanceof DeepgramSpeechProvider)) {
    notRun("STT_PROVIDER_MUST_BE_DEEPGRAM_FOR_THIS_SMOKE_TEST");
  }

  const showTranscript = includeTranscript();
  const results: SmokeResult[] = [];
  const audioByLanguage = new Map<
    string,
    { audio: Buffer; mimeType: string }
  >();

  for (const { testCase, path } of fixturePaths) {
    const { audio, mimeType } = await readFixture(path);
    audioByLanguage.set(testCase.language, { audio, mimeType });
    try {
      const streamingResult = await provider.transcribeStream({
        audio,
        mimeType,
        language: testCase.language,
        context:
          "Controlled STT smoke test. Transcribe only the spoken content.",
      });
      results.push(
        toSmokeResult(testCase, mimeType, streamingResult, showTranscript)
      );
    } catch (error) {
      const serviceError =
        error instanceof SpeechServiceError ? error : undefined;
      results.push({
        case: testCase.name,
        provider: provider.name,
        model: provider.model,
        requestedLanguage: testCase.language,
        providerLanguage: testCase.language,
        audioFormat: mimeType,
        audioDurationSeconds: null,
        firstPartialLatencyMs: null,
        finalResultLatencyMs: null,
        success: false,
        transcript: null,
        transcriptLength: null,
        errorCode: serviceError?.code || "PROVIDER_FAILURE",
      });
    }
  }

  const arabicToSpanish = await runArabicToSpanishChain(
    provider,
    results,
    audioByLanguage.get("ar"),
    showTranscript
  );

  const realProviderVerified =
    results.every(result => result.success) && arabicToSpanish.success;
  console.log(
    JSON.stringify(
      {
        realProviderVerified,
        provider: provider.name,
        model: provider.model,
        results,
        arabicToSpanish,
      },
      null,
      2
    )
  );
  if (!realProviderVerified) process.exitCode = 1;
}

function toSmokeResult(
  testCase: SmokeCase,
  mimeType: string,
  streamingResult: SpeechStreamingResult,
  showTranscript: boolean
): SmokeResult {
  const response = streamingResult.response;
  return {
    case: testCase.name,
    provider: "deepgram",
    model: "nova-3",
    requestedLanguage: testCase.language,
    providerLanguage: response.language,
    audioFormat: mimeType,
    audioDurationSeconds: response.duration,
    firstPartialLatencyMs: streamingResult.firstPartialLatencyMs,
    finalResultLatencyMs: streamingResult.finalResultLatencyMs,
    success: true,
    transcript: showTranscript ? response.text : null,
    transcriptLength: response.text.length,
  };
}

async function runArabicToSpanishChain(
  provider: DeepgramSpeechProvider,
  results: SmokeResult[],
  arabicFixture: { audio: Buffer; mimeType: string } | undefined,
  showTranscript: boolean
) {
  if (!arabicFixture || results.some(result => !result.success)) {
    return {
      success: false,
      skipped: true,
      reason:
        "All configured STT cases must succeed before the controlled Arabic to Spanish chain runs",
      provider: provider.name,
      model: provider.model,
    };
  }

  const sttStartedAt = performance.now();
  let transcript: string;
  let sttLatencyMs: number;
  try {
    const transcription = await provider.transcribeStream({
      audio: arabicFixture.audio,
      mimeType: arabicFixture.mimeType,
      language: "ar",
      context: "Controlled Arabic to Spanish end-to-end smoke test.",
    });
    transcript = transcription.response.text;
    sttLatencyMs =
      transcription.finalResultLatencyMs ??
      Math.round(performance.now() - sttStartedAt);
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
      totalLatencyMs: Math.round(performance.now() - sttStartedAt),
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
      realProviderVerified: false,
      errorCode:
        error instanceof SpeechServiceError ? error.code : "SMOKE_TEST_FAILURE",
    })
  );
  process.exitCode = 1;
});
