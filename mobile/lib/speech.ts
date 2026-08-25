import * as Speech from "expo-speech";
import { normalizeVoiceRate } from "@linguabridge/contracts/meetingSpecs";

const languageTags: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  tr: "tr-TR",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
};

export async function speakMeetingTranslation(input: {
  text: string;
  language: string;
  rate?: number;
  voiceName?: string;
}) {
  if (!input.text.trim()) return;
  const language = languageTags[input.language] ?? input.language;
  const voices = await Speech.getAvailableVoicesAsync();
  const languageVoices = voices.filter(voice => voice.language.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
  const profileIndex = input.voiceName === "warm" ? 1 : input.voiceName === "clear" ? 2 : 0;
  const preferredVoice = voices.find(voice => voice.identifier === input.voiceName)
    ?? languageVoices[profileIndex % Math.max(1, languageVoices.length)]
    ?? languageVoices[0];
  await Speech.stop();
  Speech.speak(input.text, {
    language,
    voice: preferredVoice?.identifier,
    rate: normalizeVoiceRate(input.rate ?? 1),
    useApplicationAudioSession: false,
  });
}

export async function stopMeetingSpeech() {
  await Speech.stop();
}
