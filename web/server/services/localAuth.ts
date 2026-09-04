import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";

const deriveKey = (password: string, salt: Buffer, keyLength: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: 16384, r: 8, p: 1 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived as Buffer);
      }
    );
  });
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_COOKIE = "linguabridge_refresh";
const ACCESS_TOKEN_COOKIE = COOKIE_NAME;

export const AUTH_CONSTANTS = {
  passwordMinLength: PASSWORD_MIN_LENGTH,
  passwordMaxLength: PASSWORD_MAX_LENGTH,
  accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
  refreshTokenTtlMs: REFRESH_TOKEN_TTL_MS,
  accessTokenCookie: ACCESS_TOKEN_COOKIE,
  refreshTokenCookie: REFRESH_TOKEN_COOKIE,
} as const;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)) &&
    email.length <= 320
  );
}

export function validatePassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, 64);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltEncoded, hashEncoded] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltEncoded || !hashEncoded)
    return false;
  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(hashEncoded, "base64url");
    if (Number(n) !== 16384 || Number(r) !== 8 || Number(p) !== 1) return false;
    const actual = await deriveKey(password, salt, expected.length);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRefreshToken() {
  const raw = randomBytes(48).toString("base64url");
  return { raw, hash: hashRefreshToken(raw) };
}

export function createAccessToken(openId: string, name: string) {
  return sdk.signSession(
    {
      openId,
      appId: ENV.appId || "local-auth",
      name: name || "LinguaBridge user",
    },
    { expiresInMs: ACCESS_TOKEN_TTL_MS }
  );
}

export function setAuthCookies(
  req: Request,
  res: Response,
  accessToken: string,
  refreshToken: string
) {
  const options = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, accessToken, {
    ...options,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...options,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(req: Request, res: Response) {
  const options = getSessionCookieOptions(req);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

export function requestId() {
  return randomUUID();
}

export const AUTH_ERROR_MESSAGE = "Invalid email or password";
