import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createConfiguredSpeechToTextProvider,
  SpeechToTextServiceError,
} from "../server/services/speechToTextService";
import { speechToTextLimits } from "../server/services/speechToTextService";

const requiredLanguages = ["ar", "es", "en"] as const;
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
  language: string;
  firstPartialLatencyMs: number | null;
  finalTranscriptLatencyMs: number | null;
  success: boolean;
  errorCode?: string;
  textLength?: number;
};

function notRun(reason: string): never {
  console.log(`REAL PROVIDER TEST = NOT RUN — ${reason}`);
  process.exit(0);
}

async function main() {
  if (
    !process.env.BUILT_IN_FORGE_API_URL ||
    !process.env.BUILT_IN_FORGE_API_KEY
  ) {
    notRun("CREDENTIALS NOT CONFIGURED");
  }
  const audioPath = process.env.STT_SMOKE_AUDIO_FILE;
  if (!audioPath) notRun("AUDIO FIXTURE NOT PROVIDED");

  const extension = extname(audioPath).toLowerCase();
  const mimeType = process.env.STT_SMOKE_MIME_TYPE || mimeTypes[extension];
  if (!mimeType) notRun("SUPPORTED AUDIO MIME TYPE NOT PROVIDED");

  const audio = await readFile(audioPath);
  if (!audio.length || audio.length > speechToTextLimits.maxChunkBytes) {
    notRun("AUDIO FIXTURE IS EMPTY OR EXCEEDS 16MB");
  }

  const provider = createConfiguredSpeechToTextProvider();
  const results: SmokeResult[] = [];
  for (const language of requiredLanguages) {
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
        language,
        firstPartialLatencyMs: null,
        finalTranscriptLatencyMs: Math.round(performance.now() - startedAt),
        success: true,
        textLength: result.text.length,
      });
    } catch (error) {
      const serviceError =
        error instanceof SpeechToTextServiceError ? error : undefined;
      results.push({
        provider: provider.name,
        language,
        firstPartialLatencyMs: null,
        finalTranscriptLatencyMs: null,
        success: false,
        errorCode: serviceError?.code || "PROVIDER_FAILURE",
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        provider: provider.name,
        languages: results,
        partialTranscript: "not_available_for_chunk_provider",
      },
      null,
      2
    )
  );
  if (results.some(result => !result.success)) process.exitCode = 1;
}

main().catch(error => {
  console.error(
    JSON.stringify({
      success: false,
      errorCode:
        error instanceof SpeechToTextServiceError
          ? error.code
          : "SMOKE_TEST_FAILURE",
    })
  );
  process.exitCode = 1;
});
