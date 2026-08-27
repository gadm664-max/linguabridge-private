# LINGUABRIDGE — Manus Report for Phase 3A.2

**Author:** Manus AI
**Repository:** `gadm664-max/linguabridge-private`
**Implementation commit:** `82fa8d80a4a47780c6ef6facbd41611b6aaae1b1`
**Scope:** Real STT provider preparation and verification only. No TTS, WebRTC, WhatsApp, mobile production work, billing, summaries, or meeting intelligence.

## Final status

```text
REAL_PROVIDER_VERIFIED = NO
PHASE_3A.2 = NOT PASS
```

The implementation and verification harness are complete, but the real-provider gate was not passed because `DEEPGRAM_API_KEY` was not configured and no external Deepgram request was made. Deterministic tests are not treated as real-provider verification.

## Provider decision

The selected first production STT provider is **Deepgram**. The selected model is **`nova-3`**, which Deepgram documents for meetings, multilingual audio, and streaming. The provider is isolated behind the existing `SpeechProvider` contract and is invoked by `SpeechService`; application business logic does not call Deepgram directly.

| Provider                    | Arabic / Egyptian Arabic                                                                                      | Spanish                                                       | English                              | Streaming and partials                                                                                                | Authentication                                                  | Decision     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| Deepgram                    | `ar` and `ar-EG` are listed for Nova-3                                                                        | `es` is listed; `es-ES` is normalized to Deepgram's `es` code | `en` and `en-US` are listed          | Live streaming, interim results, final results, endpointing, close, keep-alive, and reconnect guidance are documented | Server-side `DEEPGRAM_API_KEY` using `Authorization: Token ...` | **Selected** |
| Azure Speech                | Official locale table lists Arabic locales including `ar-SA`; `ar-EG` is listed in the reviewed documentation | `es-ES` and `es-MX` are listed                                | `en-US` and `en-GB` are listed       | Real-time recognition and audio input streams are documented                                                          | Speech resource key plus region                                 | Alternative  |
| Google Cloud Speech-to-Text | Broad language support is documented; exact locale mapping was not used for this implementation               | Broad language support is documented                          | Broad language support is documented | Streaming recognition is documented                                                                                   | Google Cloud service-account/OAuth setup                        | Alternative  |

Pricing is usage-based and time-sensitive. Deepgram's official pricing page exposes streaming prices by model and plan; Azure documents audio-hour billing in second increments; Google documents pricing based on successfully processed audio. No pricing value is hard-coded in the application and no billing request was made.

## Implementation

The following server-side components were added or updated:

| File                                                | Purpose                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/server/services/speechToTextService.ts`        | Adds `DeepgramSpeechProvider`, `SpeechService`, provider registry/fallback, language normalization, and `transcribeStream` metrics                            |
| `web/server/services/speechStreamTransport.ts`      | Separates Deepgram WebSocket transport from provider logic; handles connect, audio chunks, interim/final result events, provider errors, close, and reconnect |
| `web/server/services/speechToTextService.test.ts`   | Tests provider adaptation and partial/final latency metadata with injected transport                                                                          |
| `web/server/services/speechStreamTransport.test.ts` | Tests WebSocket URL/auth configuration, result parsing, `CloseStream`, and reconnect using a deterministic mock transport                                     |
| `web/scripts/stt-live-smoke.ts`                     | Calls Deepgram only when the real key and real audio fixtures are present; otherwise exits with an explicit non-pass status                                   |
| `web/server/_core/env.ts`                           | Reads `DEEPGRAM_API_KEY` server-side and defaults `STT_PROVIDER` to `deepgram`                                                                                |
| `.env.example`                                      | Documents empty server-side configuration names only                                                                                                          |
| `web/package.json` / `web/pnpm-lock.yaml`           | Adds the `ws` transport dependency and type package; includes new files in lint coverage                                                                      |
| `web/docs/PHASE_3A.md` / `web/docs/ARCHITECTURE.md` | Documents Deepgram streaming and the provider boundary                                                                                                        |
| `PHASE_3A2_PROVIDER_RESEARCH.md`                    | Records official provider research notes and URLs                                                                                                             |

The production credential name is exactly:

```text
DEEPGRAM_API_KEY=
```

The actual key was not available in the execution environment and was not written to the repository, logs, browser bundle, or API responses. `BUILT_IN_FORGE_API_KEY` is not used as the production Deepgram STT credential.

## Smoke-test contract

Run from `web/`:

```bash
pnpm stt:smoke
```

The smoke test requires `DEEPGRAM_API_KEY` and real local audio fixtures. It supports separate fixtures through `STT_SMOKE_AUDIO_AR`, `STT_SMOKE_AUDIO_AR_EG`, `STT_SMOKE_AUDIO_ES_ES`, and `STT_SMOKE_AUDIO_EN_US`; a shared `STT_SMOKE_AUDIO_FILE` is accepted only for the general Arabic case. The optional `STT_SMOKE_INCLUDE_TRANSCRIPT=true` flag is required to print transcript text.

When the key is absent, the script prints:

```text
REAL_PROVIDER_VERIFIED = NO
REASON = DEEPGRAM_API_KEY_NOT_CONFIGURED
```

When enabled with real fixtures, the script records provider, model, requested/provider language, audio format, audio duration, first interim latency, final-result latency, success/error code, and transcript length. It runs the Arabic → Spanish chain only after all configured STT cases succeed, using the existing `TranslationService` for the translation step.

## Verification results

The following commands were executed on 2026-08-27:

| Command             | Result                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`        | **PASS**                                                                                                               |
| `pnpm lint`         | **PASS**                                                                                                               |
| `pnpm test`         | **PASS — 34 test files / 100 tests passed**                                                                            |
| `pnpm build`        | **PASS**; existing warnings for analytics placeholders, non-module analytics script, and a minified chunk above 500 kB |
| `pnpm audit --prod` | **PASS — No known vulnerabilities found**                                                                              |
| `pnpm stt:smoke`    | **Executed; explicit skip: `DEEPGRAM_API_KEY_NOT_CONFIGURED`**                                                         |

The targeted streaming suite also passed: **14 tests passed** across `speechStreamTransport.test.ts` and `speechToTextService.test.ts`. The full suite emitted existing non-blocking OAuth configuration warnings because `OAUTH_SERVER_URL` is not configured in the test environment.

## Real-provider results

| Test                                                 | Result                            |
| ---------------------------------------------------- | --------------------------------- |
| Arabic (`ar`)                                        | **NOT RUN — no external request** |
| Egyptian Arabic (`ar-EG`)                            | **NOT RUN — no external request** |
| Spanish (`es-ES`)                                    | **NOT RUN — no external request** |
| English (`en-US`)                                    | **NOT RUN — no external request** |
| Arabic → Deepgram STT → TranslationService → Spanish | **NOT RUN**                       |
| Actual first-partial latency                         | **Not available**                 |
| Actual final-result latency                          | **Not available**                 |
| Actual transcript/translation                        | **Not available**                 |

## Remaining blockers

The exact blockers are the missing server-side `DEEPGRAM_API_KEY` and missing non-sensitive real audio fixtures for the requested language cases. Until both are present, no external provider call can be made and no language transcript or latency can be reported. The database verification remains unrelated to this STT gate and is not run when `DATABASE_URL` is absent.

## References

[1]: https://developers.deepgram.com/docs/models-languages-overview "Deepgram Models & Languages Overview"
[2]: https://developers.deepgram.com/docs/language "Deepgram Languages Support"
[3]: https://developers.deepgram.com/docs/live-streaming-audio "Deepgram Live Streaming Audio"
[4]: https://developers.deepgram.com/docs/interim-results "Deepgram Interim Results"
[5]: https://developers.deepgram.com/docs/understand-endpointing-interim-results "Deepgram Endpointing and Interim Results"
[6]: https://deepgram.com/pricing "Deepgram Pricing"
[7]: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support "Azure Speech language and voice support"
[8]: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech "Azure Speech real-time speech recognition"
[9]: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-audio-input-streams "Azure Speech SDK audio input streams"
[10]: https://cloud.google.com/speech-to-text "Google Cloud Speech-to-Text"
[11]: https://cloud.google.com/speech-to-text/pricing "Google Cloud Speech-to-Text pricing"
