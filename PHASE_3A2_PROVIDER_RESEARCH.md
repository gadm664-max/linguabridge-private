# Phase 3A.2 STT provider research notes

## Microsoft Azure Speech official documentation

Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support

The Microsoft Learn language-support table lists Azure Speech-to-text locales including Arabic locales such as `ar-SA`, Spanish locales such as `es-ES` and `es-MX`, and English locales such as `en-US` and `en-GB`. The page marks these locales as supported for fast transcription. It also lists real-time transcription as a Speech-to-text capability.

Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text

The official quickstart is explicitly for real-time speech-to-text. It states that an Azure subscription and Foundry project are prerequisites and provides a real-time Speech-to-text workflow.

At this point, no credential was configured or used. These notes are capability research only; they are not evidence of a successful provider request.

## Comparison candidates

Source: https://developers.deepgram.com/docs/models-languages-overview

Deepgram documents Flux as a streaming model optimized for real-time agents and ultra-low latency. The page also documents Nova-3 and shows an authorization header with a Deepgram API key in its request example. The language overview page alone did not provide a directly extractable confirmation in the reviewed text that the same streaming model supports all three required locales, so this candidate requires an additional locale-specific verification before selection.

Source: https://cloud.google.com/speech-to-text

Google Cloud states that Speech-to-Text supports real-time/streaming audio and 85+ languages and variants. The reviewed product page confirms streaming recognition, but the exact authentication shape and exact Arabic/Spanish/English locale rows should be verified from the Google API reference before selection.

Azure remains a strong candidate because the official language table directly lists Arabic (`ar-SA` and other Arabic locales), Spanish (`es-ES`/`es-MX`), and English (`en-US`/`en-GB`) Speech-to-text locales, and the official quickstart explicitly covers real-time speech-to-text. Final credential choice remains pending final official auth/streaming endpoint verification.

## Azure authentication and streaming evidence

Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech

The official guide describes Azure Speech real-time speech-to-text and shows a request using a Speech resource endpoint, `Ocp-Apim-Subscription-Key`, a language query such as `en-US`, and an audio file. The guide identifies the Speech resource API key, Speech service region, and input audio path as required values in its examples.

Source: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-audio-input-streams

The official Speech SDK guide states that audio can be streamed into the recognizer and demonstrates configuring a Speech recognizer with a subscription key and region. It documents PCM stream constraints for custom audio input: mono, 16-bit signed PCM, 8,000 or 16,000 samples per second, little-endian/two-block alignment. Audio not matching those constraints must be transcoded for that stream path.

No Azure account, Speech resource, key, region, or audio fixture was available in the current execution environment. No provider request was made.

## Deepgram official streaming evidence

Source: https://developers.deepgram.com/docs/language

Deepgram's language documentation exposes a Streaming:Nova mode and explains that the requested language is supplied with the `language` parameter. The page's request example uses a server-side `Authorization: Token` credential derived from the configured Deepgram API key. It states that a specific language restricts transcription to that language, while multilingual audio may use `language=multi` with a multilingual model.

Source: https://developers.deepgram.com/docs/live-streaming-audio

Deepgram documents live streaming transcription over its SDK/streaming API. The navigation and page content expose interim-results, endpointing, keep-alive, close-stream, and reconnection-related guidance. The page states that streaming audio is transcribed in real time and that the API response is the opportunity to retrieve the transcript; it also links to endpointing/interim-results guidance.

Deepgram is therefore the selected first production STT provider for Phase 3A.2 under the supplied phase instructions. The required credential is exactly `DEEPGRAM_API_KEY`, server-side only. No Deepgram credential is currently configured or used.

## Pricing-model evidence

Source: https://deepgram.com/pricing

Deepgram's official pricing page presents Speech-to-text streaming pricing by model and usage plan, with pay-as-you-go and growth options and per-minute/per-hour displays. The page lists separate streaming rows for Flux and Nova-3 models. Prices are time-sensitive and were not hard-coded into the application.

Source: https://azure.microsoft.com/en-us/pricing/details/speech/

Azure's official pricing page states that Speech-to-text hours are measured as audio sent to the service and billed in second increments. The page provides region/currency selection and notes that pricing can vary with agreement, purchase date, currency exchange, and region.

These pricing pages support a qualitative comparison only. No billing account, subscription, or paid request was created or used during this task.
