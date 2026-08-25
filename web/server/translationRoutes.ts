import { Router, type Express, type Request, type Response } from "express";
import { z } from "zod";
import { supportedLanguages } from "@linguabridge/contracts/meetingSpecs";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { requestId } from "./services/localAuth";
import {
  translateMeetingText,
  translationLimits,
  TranslationServiceError,
} from "./services/translationService";

const languageCodes: Set<string> = new Set(
  supportedLanguages.map(language => language.code)
);
const requestSchema = z
  .object({
    text: z.string(),
    sourceLanguage: z.string().trim().min(2).max(16),
    targetLanguage: z.string().trim().min(2).max(16),
    context: z
      .string()
      .trim()
      .max(translationLimits.maxContextLength)
      .optional(),
  })
  .strict();

const limiter = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;

function isRateLimited(req: Request, res: Response) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = limiter.get(key);
  if (!current || current.resetAt <= now) {
    limiter.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (current.count >= RATE_LIMIT) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many translation requests",
      },
    });
    return true;
  }
  current.count += 1;
  return false;
}

async function recordUsage(
  input: Parameters<typeof db.recordTranslationUsage>[0]
) {
  try {
    await db.recordTranslationUsage(input);
  } catch (error) {
    console.error(
      "[Translation] Usage recording failed",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}

function sendError(res: Response, error: unknown, id: string) {
  if (error instanceof TranslationServiceError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, requestId: id },
    });
    return;
  }
  console.error(
    "[Translation] Unexpected request failure",
    error instanceof Error ? error.message : "unknown error"
  );
  res.status(502).json({
    error: {
      code: "TRANSLATION_FAILED",
      message: "Translation failed",
      requestId: id,
    },
  });
}

export function registerTranslationRoutes(app: Express) {
  const router = Router();

  router.post("/text", async (req: Request, res: Response) => {
    const id = requestId();
    const startedAt = Date.now();
    if (isRateLimited(req, res)) return;

    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId: id,
        },
      });
      return;
    }

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid translation request",
          requestId: id,
        },
      });
      return;
    }
    const input = parsed.data;
    if (
      !languageCodes.has(input.sourceLanguage) ||
      !languageCodes.has(input.targetLanguage)
    ) {
      res.status(422).json({
        error: {
          code: "UNSUPPORTED_LANGUAGE",
          message: "Unsupported language",
          requestId: id,
        },
      });
      return;
    }
    if (!input.text.trim()) {
      res.status(400).json({
        error: {
          code: "EMPTY_TEXT",
          message: "Translation text is required",
          requestId: id,
        },
      });
      return;
    }
    if (input.text.length > translationLimits.maxTextLength) {
      res.status(413).json({
        error: {
          code: "TEXT_TOO_LONG",
          message: "Translation text is too long",
          requestId: id,
        },
      });
      return;
    }

    try {
      const result = await translateMeetingText(input);
      const latencyMs = Date.now() - startedAt;
      await recordUsage({
        userId: user.id,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        characterCount: input.text.length,
        latencyMs,
        success: true,
        errorCode: null,
      });
      res.json({
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        originalText: input.text,
        translatedText: result.translation,
        provider: result.provider,
        model: result.model,
        requestId: id,
        latencyMs,
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorCode =
        error instanceof TranslationServiceError
          ? error.code
          : "TRANSLATION_FAILED";
      await recordUsage({
        userId: user.id,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        characterCount: input.text.length,
        latencyMs,
        success: false,
        errorCode,
      });
      sendError(res, error, id);
    }
  });

  app.use(["/translate", "/api/translate"], router);
}
