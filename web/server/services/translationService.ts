import {
  createTranslationProvider,
  type TranslationProvider,
  type TranslationRequest,
  TranslationProviderError,
} from "./translationProvider";

export type {
  TranslationProvider,
  TranslationRequest,
} from "./translationProvider";

const MAX_TEXT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 500;
let defaultProvider: TranslationProvider | undefined;

export class TranslationServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 502,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "TranslationServiceError";
  }
}

function getDefaultProvider() {
  try {
    return (defaultProvider ??= createTranslationProvider());
  } catch (error) {
    if (error instanceof TranslationServiceError) throw error;
    throw new TranslationServiceError(
      "PROVIDER_CONFIGURATION",
      "Translation provider configuration is invalid",
      500
    );
  }
}

function validateRequest(input: TranslationRequest) {
  const text = input.text.trim();
  if (!text)
    throw new TranslationServiceError(
      "EMPTY_TEXT",
      "Translation text is required",
      400
    );
  if (text.length > MAX_TEXT_LENGTH)
    throw new TranslationServiceError(
      "TEXT_TOO_LONG",
      "Translation text is too long",
      413
    );
  if (input.context && input.context.length > MAX_CONTEXT_LENGTH) {
    throw new TranslationServiceError(
      "CONTEXT_TOO_LONG",
      "Translation context is too long",
      413
    );
  }
  return text;
}

function isUnsafePlainText(value: string) {
  return /<\/?script\b|<!doctype\b|```/.test(value);
}

export async function translateMeetingText(
  input: TranslationRequest,
  provider?: TranslationProvider
) {
  const text = validateRequest(input);
  const selectedProvider = provider ?? getDefaultProvider();
  if (input.sourceLanguage === input.targetLanguage) {
    return {
      translation: text,
      provider: "passthrough",
      model: "passthrough",
    };
  }

  let result;
  try {
    result = await selectedProvider.translate({ ...input, text });
  } catch (error) {
    if (error instanceof TranslationProviderError) {
      throw new TranslationServiceError(
        error.code,
        error.message,
        error.statusCode,
        error.retryAfterMs
      );
    }
    console.error(
      "[Translation] Provider request failed",
      error instanceof Error ? error.message : "unknown error"
    );
    throw new TranslationServiceError(
      "PROVIDER_UNAVAILABLE",
      "Translation provider unavailable",
      502
    );
  }

  if (
    !result ||
    typeof result.translatedText !== "string" ||
    !result.translatedText.trim() ||
    isUnsafePlainText(result.translatedText)
  ) {
    throw new TranslationServiceError(
      "MALFORMED_PROVIDER_RESPONSE",
      "Translation provider returned an invalid response",
      502
    );
  }
  return {
    translation: result.translatedText,
    provider: result.provider,
    model: result.model,
  };
}

export const translationLimits = {
  maxTextLength: MAX_TEXT_LENGTH,
  maxContextLength: MAX_CONTEXT_LENGTH,
} as const;
