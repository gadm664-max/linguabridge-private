import type {
  SpeechToTextProvider,
  SpeechToTextRequest,
  SpeechToTextResult,
} from "../services/speechToTextService";

/** Test-only provider. It never calls a network service or reads credentials. */
export class DeterministicSpeechToTextProvider implements SpeechToTextProvider {
  readonly name = "deterministic-test-stt";
  readonly model = "deterministic-test-model";

  constructor(private readonly result: SpeechToTextResult) {}

  async transcribeChunk(_input: SpeechToTextRequest) {
    return this.result;
  }
}
