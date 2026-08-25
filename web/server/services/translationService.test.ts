import { describe, expect, it, vi } from "vitest";
import {
  translateMeetingText,
  type TranslationProvider,
} from "./translationService";

describe("translateMeetingText", () => {
  it("returns a trimmed passthrough for identical languages without calling a provider", async () => {
    const provider: TranslationProvider = {
      name: "test-provider",
      translate: vi.fn(),
    };

    await expect(
      translateMeetingText(
        {
          text: "  Hello  ",
          sourceLanguage: "en",
          targetLanguage: "en",
        },
        provider
      )
    ).resolves.toEqual({
      translation: "Hello",
      provider: "passthrough",
      model: "passthrough",
    });
    expect(provider.translate).not.toHaveBeenCalled();
  });

  it("delegates cross-language translation to the injected provider", async () => {
    const provider: TranslationProvider = {
      name: "test-provider",
      translate: vi.fn().mockResolvedValue({
        translatedText: "مرحبا",
        provider: "test-provider",
        model: "test-model",
      }),
    };

    await expect(
      translateMeetingText(
        {
          text: " Hello ",
          sourceLanguage: "en",
          targetLanguage: "ar",
        },
        provider
      )
    ).resolves.toEqual({
      translation: "مرحبا",
      provider: "test-provider",
      model: "test-model",
    });
    expect(provider.translate).toHaveBeenCalledWith({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });
  });

  it("rejects empty input before invoking a provider", async () => {
    const provider: TranslationProvider = {
      name: "test-provider",
      translate: vi.fn(),
    };

    await expect(
      translateMeetingText(
        {
          text: "   ",
          sourceLanguage: "en",
          targetLanguage: "ar",
        },
        provider
      )
    ).rejects.toThrow("Translation text is required");
    expect(provider.translate).not.toHaveBeenCalled();
  });
});
