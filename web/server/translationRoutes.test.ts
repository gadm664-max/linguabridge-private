import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTranslationRoutes } from "./translationRoutes";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { translateMeetingText } from "./services/translationService";

vi.mock("./db", () => ({ recordTranslationUsage: vi.fn() }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./services/translationService", () => ({
  translateMeetingText: vi.fn(),
  translationLimits: { maxTextLength: 4000, maxContextLength: 500 },
  TranslationServiceError: class TranslationServiceError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly statusCode = 502
    ) {
      super(message);
    }
  },
}));

const user = {
  id: 3,
  openId: "local-test",
  name: "Test User",
  email: "test@example.com",
  role: "user" as const,
};
let server: ReturnType<express.Express["listen"]>;

async function startServer() {
  const app = express();
  app.use(express.json());
  registerTranslationRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sdk.authenticateRequest).mockResolvedValue(user as never);
  vi.mocked(db.recordTranslationUsage).mockResolvedValue(undefined);
  vi.mocked(translateMeetingText).mockResolvedValue({
    translation: "مرحبا، كيف حالك؟",
    provider: "test-provider",
    model: "test-model",
  });
});

describe("POST /translate/text", () => {
  it("authenticates, forwards context, and returns a structured translation", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/translate/text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "Hello, how are you?",
        sourceLanguage: "en",
        targetLanguage: "ar",
        context: "general conversation",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "ar",
      originalText: "Hello, how are you?",
      translatedText: "مرحبا، كيف حالك؟",
      provider: "test-provider",
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.latencyMs).toEqual(expect.any(Number));
    expect(translateMeetingText).toHaveBeenCalledWith(
      expect.objectContaining({ context: "general conversation" })
    );
    expect(db.recordTranslationUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, success: true })
    );
  });

  it("rejects unauthenticated and unsupported-language requests", async () => {
    const baseUrl = await startServer();
    vi.mocked(sdk.authenticateRequest).mockRejectedValueOnce(
      new Error("unauthorized")
    );
    const unauthenticated = await fetch(`${baseUrl}/translate/text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "Hello",
        sourceLanguage: "en",
        targetLanguage: "ar",
      }),
    });
    expect(unauthenticated.status).toBe(401);

    const unsupported = await fetch(`${baseUrl}/translate/text`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "Hello",
        sourceLanguage: "xx",
        targetLanguage: "ar",
      }),
    });
    expect(unsupported.status).toBe(422);
    expect(translateMeetingText).not.toHaveBeenCalled();
  });

  it("rate limits excessive requests and returns Retry-After", async () => {
    const baseUrl = await startServer();
    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(
        await fetch(`${baseUrl}/translate/text`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: "Hello",
            sourceLanguage: "en",
            targetLanguage: "ar",
          }),
        })
      );
    }

    expect(responses.at(-1)?.status).toBe(429);
    expect(responses.at(-1)?.headers.get("retry-after")).toEqual(
      expect.any(String)
    );
  });
});
