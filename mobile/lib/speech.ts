import * as Speech from "expo-speech";

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
  const preferredVoice = voices.find(voice => voice.identifier === input.voiceName)
    ?? voices.find(voice => voice.language.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
  await Speech.stop();
  Speech.speak(input.text, {
    language,
    voice: preferredVoice?.identifier,
    rate: Math.max(0.7, Math.min(input.rate ?? 1, 1.4)),
    useApplicationAudioSession: false,
  });
}

export async function stopMeetingSpeech() {
  await Speech.stop();
}
