import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";

function createCaller(role: "user" | "admin") {
  return appRouter.createCaller({
    user: {
      id: role === "admin" ? 1 : 2,
      openId: `${role}-whatsapp-test`,
      name: role === "admin" ? "مالك LinguaBridge" : "مستخدم اختبار",
      email: null,
      loginMethod: "test",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as never,
    res: {} as never,
  });
}

describe("whatsapp status access", () => {
  it("returns non-sensitive assistant status to an authenticated user", async () => {
    const status = await createCaller("user").whatsapp.status();
    expect(status.ownerOnlyManagement).toBe(true);
    expect(status.consentRequired).toBe(true);
    expect("accessToken" in status).toBe(false);
  });

  it("rejects management status for non-admin users", async () => {
    await expect(createCaller("user").whatsapp.adminStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns only non-secret configuration metadata to admins", async () => {
    const status = await createCaller("admin").whatsapp.adminStatus();
    expect(status.managedBy).toBe("مالك LinguaBridge");
    expect(status.webhookPath).toBe("/api/whatsapp/webhook");
    expect(status.secretsExposed).toBe(false);
  });
});
