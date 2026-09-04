import type {
  SpeechProvider,
  SpeechRequest,
  SpeechResult,
} from "../services/speechToTextService";

/** Test-only provider. It never calls a network service or reads credentials. */
export class DeterministicSpeechToTextProvider implements SpeechProvider {
  readonly name = "deterministic-test-stt";
  readonly model = "deterministic-test-model";

  constructor(private readonly result: SpeechResult) {}

  async transcribeChunk(_input: SpeechRequest) {
    return this.result;
  }
}
