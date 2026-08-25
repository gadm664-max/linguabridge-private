import { parse as parseCookieHeader } from "cookie";
import { Router, type Express, type Request, type Response } from "express";
import { z } from "zod";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import {
  AUTH_ERROR_MESSAGE,
  AUTH_CONSTANTS,
  clearAuthCookies,
  createAccessToken,
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  normalizeEmail,
  setAuthCookies,
  validateEmail,
  validatePassword,
  verifyPassword,
} from "./services/localAuth";

const registerSchema = z
  .object({
    email: z.string().trim().max(320),
    name: z.string().trim().min(2).max(160),
    password: z.string().min(1).max(AUTH_CONSTANTS.passwordMaxLength),
  })
  .strict();
const loginSchema = z
  .object({
    email: z.string().trim().max(320),
    password: z.string().min(1).max(AUTH_CONSTANTS.passwordMaxLength),
  })
  .strict();

const limiter = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 12;

function clientKey(req: Request, scope: string) {
  return `${scope}:${req.ip || "unknown"}`;
}

function allowRequest(req: Request, res: Response, scope: string) {
  const now = Date.now();
  const key = clientKey(req, scope);
  const current = limiter.get(key);
  if (!current || current.resetAt <= now) {
    limiter.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many authentication requests",
      },
    });
    return false;
  }
  current.count += 1;
  return true;
}

function publicUser(user: Awaited<ReturnType<typeof db.getUserByEmail>>) {
  if (!user) return null;
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
    loginMethod: user.loginMethod,
    createdAt: user.createdAt,
  };
}

function getRefreshToken(req: Request) {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return cookies[AUTH_CONSTANTS.refreshTokenCookie];
}

async function issueSession(
  req: Request,
  res: Response,
  user: NonNullable<Awaited<ReturnType<typeof db.getUserByEmail>>>
) {
  const refresh = createRefreshToken();
  await db.createRefreshTokenRecord({
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: new Date(Date.now() + AUTH_CONSTANTS.refreshTokenTtlMs),
  });
  const access = await createAccessToken(
    user.openId,
    user.name || "LinguaBridge user"
  );
  setAuthCookies(req, res, access, refresh.raw);
}

function validationError(res: Response, message = "Invalid request") {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

export function registerAuthRoutes(app: Express) {
  const router = Router();

  router.post("/register", async (req: Request, res: Response) => {
    if (!allowRequest(req, res, "register")) return;
    const parsed = registerSchema.safeParse(req.body);
    if (
      !parsed.success ||
      !validateEmail(parsed.data.email) ||
      !validatePassword(parsed.data.password)
    ) {
      validationError(res, "Email or password does not meet the requirements");
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    try {
      const existing = await db.getUserByEmail(email);
      if (existing) {
        validationError(res, "Unable to create account");
        return;
      }
      const user = await db.createPasswordUser({
        email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
      });
      if (!user) throw new Error("User creation failed");
      await issueSession(req, res, user);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      console.error(
        "[Auth] Registration failed",
        error instanceof Error ? error.message : "unknown error"
      );
      validationError(res, "Unable to create account");
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    if (!allowRequest(req, res, "login")) return;
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success || !validateEmail(parsed.data.email)) {
      validationError(res, AUTH_ERROR_MESSAGE);
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    try {
      const record = await db.getPasswordCredentialByEmail(email);
      const valid = record
        ? await verifyPassword(
            parsed.data.password,
            record.credential.passwordHash
          )
        : false;
      if (!record || !valid) {
        res.status(401).json({
          error: { code: "INVALID_CREDENTIALS", message: AUTH_ERROR_MESSAGE },
        });
        return;
      }
      await issueSession(req, res, record.user);
      res.json({ user: publicUser(record.user) });
    } catch (error) {
      console.error(
        "[Auth] Login failed",
        error instanceof Error ? error.message : "unknown error"
      );
      res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: AUTH_ERROR_MESSAGE },
      });
    }
  });

  router.post("/refresh", async (req: Request, res: Response) => {
    if (!allowRequest(req, res, "refresh")) return;
    const raw = getRefreshToken(req);
    if (!raw) {
      res.status(401).json({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid refresh token",
        },
      });
      return;
    }
    try {
      const active = await db.getActiveRefreshToken(hashRefreshToken(raw));
      if (!active) {
        clearAuthCookies(req, res);
        res.status(401).json({
          error: {
            code: "INVALID_REFRESH_TOKEN",
            message: "Invalid refresh token",
          },
        });
        return;
      }
      const next = createRefreshToken();
      await db.revokeRefreshToken(active.token.tokenHash, next.hash);
      await db.createRefreshTokenRecord({
        userId: active.user.id,
        tokenHash: next.hash,
        expiresAt: new Date(Date.now() + AUTH_CONSTANTS.refreshTokenTtlMs),
      });
      const access = await createAccessToken(
        active.user.openId,
        active.user.name || "LinguaBridge user"
      );
      setAuthCookies(req, res, access, next.raw);
      res.json({ user: publicUser(active.user) });
    } catch (error) {
      console.error(
        "[Auth] Refresh failed",
        error instanceof Error ? error.message : "unknown error"
      );
      clearAuthCookies(req, res);
      res.status(401).json({
        error: {
          code: "INVALID_REFRESH_TOKEN",
          message: "Invalid refresh token",
        },
      });
    }
  });

  router.post("/logout", async (req: Request, res: Response) => {
    const raw = getRefreshToken(req);
    if (raw) {
      try {
        await db.revokeRefreshToken(hashRefreshToken(raw));
      } catch (error) {
        console.error(
          "[Auth] Logout token revocation failed",
          error instanceof Error ? error.message : "unknown error"
        );
      }
    }
    clearAuthCookies(req, res);
    res.json({ success: true });
  });

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest({
        ...req,
        headers: req.headers,
      } as Request);
      res.json({ user: publicUser(user) });
    } catch {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
  });

  app.use(["/auth", "/api/auth"], router);
}
