import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "./authRoutes";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { hashPassword, hashRefreshToken } from "./services/localAuth";

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(),
  createPasswordUser: vi.fn(),
  createRefreshTokenRecord: vi.fn(),
  getPasswordCredentialByEmail: vi.fn(),
  getActiveRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));
vi.mock("./_core/sdk", () => ({
  sdk: {
    signSession: vi.fn(),
    authenticateRequest: vi.fn(),
  },
}));

const user = {
  id: 5,
  openId: "local_test_user",
  name: "Test User",
  email: "test@example.com",
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
  vi.mocked(sdk.signSession).mockResolvedValue("access-token");
  vi.mocked(db.createRefreshTokenRecord).mockResolvedValue(undefined);
  vi.mocked(db.revokeRefreshToken).mockResolvedValue(undefined);
});

describe("local authentication routes", () => {
  it("registers a user, issues cookies, and never returns a password hash", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(undefined);
    vi.mocked(db.createPasswordUser).mockResolvedValue(user);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "Test@Example.com",
        name: "Test User",
        password: "Correct horse battery staple!",
      }),
    });
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") || "";

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({
      email: "test@example.com",
      name: "Test User",
    });
    expect(body.user.passwordHash).toBeUndefined();
    expect(setCookie).toContain("app_session_id=access-token");
    expect(setCookie).toContain("linguabridge_refresh=");
    expect(db.createPasswordUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        passwordHash: expect.not.stringContaining("Correct horse"),
      })
    );
  });

  it("rejects weak registration and duplicate email without revealing account details", async () => {
    const baseUrl = await startServer();
    const weak = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        name: "Test User",
        password: "short",
      }),
    });
    expect(weak.status).toBe(400);

    vi.mocked(db.getUserByEmail).mockResolvedValue(user);
    const duplicate = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        name: "Test User",
        password: "Correct horse battery staple!",
      }),
    });
    expect(duplicate.status).toBe(400);
    await expect(duplicate.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "Unable to create account" },
    });
  });

  it("rotates an active refresh token and revokes the previous hash", async () => {
    vi.mocked(db.getActiveRefreshToken).mockResolvedValue({
      token: { tokenHash: hashRefreshToken("old-refresh") },
      user,
    } as never);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: "linguabridge_refresh=old-refresh" },
    });

    expect(response.status).toBe(200);
    expect(db.revokeRefreshToken).toHaveBeenCalledWith(
      hashRefreshToken("old-refresh"),
      expect.any(String)
    );
    expect(db.createRefreshTokenRecord).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toContain(
      "linguabridge_refresh="
    );
  });

  it("rejects an invalid refresh token and clears auth cookies", async () => {
    vi.mocked(db.getActiveRefreshToken).mockResolvedValue(undefined);
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: "linguabridge_refresh=invalid" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("app_session_id=");
    expect(response.headers.get("set-cookie")).toContain(
      "linguabridge_refresh="
    );
  });

  it("logs in with a hash, rejects wrong credentials, and revokes on logout", async () => {
    const passwordHash = await hashPassword("Correct horse battery staple!");
    vi.mocked(db.getPasswordCredentialByEmail).mockResolvedValue({
      user,
      credential: { passwordHash },
    } as never);
    const baseUrl = await startServer();
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "Correct horse battery staple!",
      }),
    });
    expect(login.status).toBe(200);

    const wrong = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "wrong password",
      }),
    });
    expect(wrong.status).toBe(401);

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { cookie: "linguabridge_refresh=refresh-value" },
    });
    expect(logout.status).toBe(200);
    expect(db.revokeRefreshToken).toHaveBeenCalled();
  });
});
