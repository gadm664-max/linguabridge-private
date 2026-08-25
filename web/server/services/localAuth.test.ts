import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashRefreshToken,
  validateEmail,
  validatePassword,
  verifyPassword,
} from "./localAuth";

describe("local authentication primitives", () => {
  it("hashes passwords and verifies only the correct secret", async () => {
    const password = "Correct horse battery staple!";
    const encoded = await hashPassword(password);

    expect(encoded).not.toContain(password);
    expect(encoded.startsWith("scrypt$16384$8$1$")).toBe(true);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(
      false
    );
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("password", "not-a-hash")).resolves.toBe(false);
    await expect(
      verifyPassword("password", "scrypt$1$1$1$bad$bad")
    ).resolves.toBe(false);
  });

  it("enforces email and password requirements", () => {
    expect(validateEmail("person@example.com")).toBe(true);
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validatePassword("short")).toBe(false);
    expect(validatePassword("long-enough-password")).toBe(true);
  });

  it("hashes refresh tokens deterministically without returning the raw token", () => {
    const token = "refresh-token-value";
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
    expect(hashRefreshToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
