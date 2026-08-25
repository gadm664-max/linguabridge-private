import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "./authRoutes";
import { registerTranslationRoutes } from "./translationRoutes";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { translateMeetingText } from "./services/translationService";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  createPasswordUser: vi.fn(),
  createRefreshTokenRecord: vi.fn(),
  getPasswordCredentialByEmail: vi.fn(),
  getActiveRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  recordTranslationUsage: vi.fn(),
}));
vi.mock("./_core/sdk", () => ({
  sdk: {
    signSession: vi.fn(),
    authenticateRequest: vi.fn(),
  },
}));
vi.mock("./services/translationService", () => ({
  translateMeetingText: vi.fn(),
  translationLimits: { maxTextLength: 4000, maxContextLength: 500 },
  TranslationServiceError: class TranslationServiceError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly statusCode = 502,
      public readonly retryAfterMs?: number
    ) {
      super(message);
    }
  },
}));

const user = {
  id: 9,
  openId: "local_integration_user",
  name: "Integration User",
  email: "integration@example.com",
  role: "user" as const,
  loginMethod: "password",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};
let server: ReturnType<express.Express["listen"]>;

async function startServer() {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
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
  vi.mocked(sdk.signSession).mockResolvedValue("integration-access-token");
  vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
  vi.mocked(db.createPasswordUser).mockResolvedValue(user);
  vi.mocked(db.createRefreshTokenRecord).mockResolvedValue(undefined);
  vi.mocked(db.recordTranslationUsage).mockResolvedValue(undefined);
  vi.mocked(sdk.authenticateRequest).mockImplementation(async req => {
    if (
      req.headers.cookie?.includes("app_session_id=integration-access-token")
    ) {
      return user as never;
    }
    throw new Error("unauthorized");
  });
  vi.mocked(translateMeetingText).mockResolvedValue({
    translation: "مرحبًا من test provider",
    provider: "deterministic-test-provider",
    model: "test-model",
  });
});

describe("Phase 2.1 authentication-to-translation flow", () => {
  it("registers, authenticates the session, translates, and returns structured metadata", async () => {
    const baseUrl = await startServer();
    const register = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "Integration@Example.com",
        name: "Integration User",
        password: "Correct horse battery staple!",
      }),
    });
    expect(register.status).toBe(201);
    const setCookie = register.headers.get("set-cookie") || "";
    const sessionCookie = setCookie
      .split(", ")
      .map(cookie => cookie.split(";")[0])
      .filter(cookie => cookie.startsWith("app_session_id="))
      .join("; ");
    expect(sessionCookie).toBe("app_session_id=integration-access-token");

    const translation = await fetch(`${baseUrl}/translate/text`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        text: "Hello from the integration test",
        sourceLanguage: "en",
        targetLanguage: "ar",
        context: "test flow",
      }),
    });
    const body = await translation.json();

    expect(translation.status).toBe(200);
    expect(body).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "ar",
      originalText: "Hello from the integration test",
      translatedText: "مرحبًا من test provider",
      provider: "deterministic-test-provider",
      model: "test-model",
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.latencyMs).toEqual(expect.any(Number));
    expect(translateMeetingText).toHaveBeenCalledWith(
      expect.objectContaining({ context: "test flow" })
    );
    expect(db.recordTranslationUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, success: true })
    );
  });
});
