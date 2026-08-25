import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM, listLLMModels, LlmGatewayError } from "../_core/llm";
import {
  ManusLlmTranslationProvider,
  TranslationProviderError,
} from "./translationProvider";

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
  LlmGatewayError: class LlmGatewayError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly statusCode: number,
      public readonly retryAfterMs?: number
    ) {
      super(message);
      this.name = "LlmGatewayError";
    }
  },
}));

describe("ManusLlmTranslationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listLLMModels).mockResolvedValue({
      object: "list",
      data: [
        { id: "gpt-5-mini", object: "model", created: 0, owned_by: "test" },
      ],
    });
  });

  it("discovers a model and exposes provider/model metadata", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      id: "completion-1",
      created: 0,
      model: "gpt-5-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "مرحبا" },
          finish_reason: "stop",
        },
      ],
    });

    const result = await new ManusLlmTranslationProvider().translate({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "ar",
      context: "greeting",
    });

    expect(result).toEqual({
      translatedText: "مرحبا",
      provider: "manus-llm",
      model: "gpt-5-mini",
    });
    expect(invokeLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5-mini" })
    );
    expect(invokeLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("greeting"),
          }),
        ]),
      })
    );
  });

  it.each([
    ["TIMEOUT", 504],
    ["RATE_LIMITED", 429],
    ["AUTHENTICATION_FAILED", 502],
    ["NETWORK_FAILURE", 503],
  ] as const)(
    "maps %s gateway errors to structured provider errors",
    async (code, statusCode) => {
      vi.mocked(invokeLLM).mockRejectedValue(
        new LlmGatewayError(code, "safe gateway message", statusCode, 1200)
      );

      await expect(
        new ManusLlmTranslationProvider().translate({
          text: "Hello",
          sourceLanguage: "en",
          targetLanguage: "ar",
        })
      ).rejects.toMatchObject({
        code,
        statusCode,
        retryAfterMs: code === "RATE_LIMITED" ? 1200 : 1200,
      });
      await expect(
        new ManusLlmTranslationProvider().translate({
          text: "Hello",
          sourceLanguage: "en",
          targetLanguage: "ar",
        })
      ).rejects.toBeInstanceOf(TranslationProviderError);
    }
  );

  it("rejects an empty or malformed provider payload", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      id: "completion-2",
      created: 0,
      model: "gpt-5-mini",
      choices: [],
    });

    await expect(
      new ManusLlmTranslationProvider().translate({
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "ar",
      })
    ).rejects.toMatchObject({ code: "MALFORMED_RESPONSE", statusCode: 502 });
  });
});
