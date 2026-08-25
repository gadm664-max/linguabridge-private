import {
  createTranslationProvider,
  type TranslationProvider,
  type TranslationRequest,
} from "./translationProvider";

export type { TranslationProvider, TranslationRequest } from "./translationProvider";

let defaultProvider: TranslationProvider | undefined;

function getDefaultProvider() {
  return defaultProvider ??= createTranslationProvider();
}

export async function translateMeetingText(
  input: TranslationRequest,
  provider: TranslationProvider = getDefaultProvider(),
) {
  const text = input.text.trim();
  if (!text) throw new Error("Translation text is required");
  if (input.sourceLanguage === input.targetLanguage) {
    return {
      translation: text,
      provider: "passthrough",
      model: "passthrough",
    };
  }

  const result = await provider.translate({ ...input, text });
  return {
    translation: result.translatedText,
    provider: result.provider,
    model: result.model,
  };
}
