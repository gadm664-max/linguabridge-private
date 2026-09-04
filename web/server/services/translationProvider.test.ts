import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM, listLLMModels, LlmGatewayError } from "../_core/llm";
import {
  FallbackTranslationProvider,
  ManusLlmTranslationProvider,
  TranslationProviderConfigurationError,
  TranslationProviderError,
  TranslationProviderRegistry,
  parseTranslationProviderOrder,
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

describe("TranslationProviderRegistry and fallback chain", () => {
  const request = {
    text: "Hello",
    sourceLanguage: "en",
    targetLanguage: "ar",
  };

  it("normalizes provider names and preserves configured order without duplicates", () => {
    const registry = new TranslationProviderRegistry();
    const providerA = { name: "provider-a", translate: vi.fn() };
    const providerB = { name: "provider-b", translate: vi.fn() };
    registry
      .register("Provider-A", () => providerA)
      .register("provider-b", () => providerB);

    expect(
      registry.resolveMany(
        parseTranslationProviderOrder("Provider-A, provider-b, provider-a")
      )
    ).toEqual([providerA, providerB]);
  });

  it("falls back from Provider A to Provider B and returns successful provider metadata", async () => {
    const providerA = {
      name: "provider-a",
      translate: vi
        .fn()
        .mockRejectedValue(
          new TranslationProviderError("NETWORK_FAILURE", "safe failure", 503)
        ),
    };
    const providerB = {
      name: "provider-b",
      translate: vi.fn().mockResolvedValue({
        translatedText: "مرحبا",
        provider: "provider-b",
        model: "b-model",
      }),
    };

    const result = await new FallbackTranslationProvider([
      providerA,
      providerB,
    ]).translate(request);
    expect(result).toEqual({
      translatedText: "مرحبا",
      provider: "provider-b",
      model: "b-model",
    });
    expect(providerA.translate).toHaveBeenCalledWith(request);
    expect(providerB.translate).toHaveBeenCalledWith(request);
  });

  it("returns the final structured provider error when all providers fail", async () => {
    const providerA = {
      name: "provider-a",
      translate: vi
        .fn()
        .mockRejectedValue(
          new TranslationProviderError("TIMEOUT", "timeout", 504)
        ),
    };
    const providerB = {
      name: "provider-b",
      translate: vi
        .fn()
        .mockRejectedValue(
          new TranslationProviderError(
            "RATE_LIMITED",
            "rate limited",
            429,
            2000
          )
        ),
    };

    await expect(
      new FallbackTranslationProvider([providerA, providerB]).translate(request)
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429,
      retryAfterMs: 2000,
    });
  });

  it("fails closed for an unregistered configured provider", () => {
    const registry = new TranslationProviderRegistry();
    expect(() => registry.resolve("provider-c")).toThrow(
      TranslationProviderConfigurationError
    );
  });
});
