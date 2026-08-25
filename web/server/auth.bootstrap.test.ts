import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

vi.mock("./db", () => ({
  ensurePersonalOrganization: vi.fn(),
  getUserOrganizations: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 7,
    openId: "bootstrap-user",
    email: "user@example.com",
    name: "Workspace Owner",
    loginMethod: "manus",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.bootstrap", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the authenticated user and workspace memberships", async () => {
    const workspace = {
      id: 12,
      name: "Workspace Owner's workspace",
      slug: "workspace-owner-7",
      role: "owner" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.ensurePersonalOrganization).mockResolvedValue(workspace);
    vi.mocked(db.getUserOrganizations).mockResolvedValue([workspace]);

    const result = await appRouter.createCaller(createAuthContext()).auth.bootstrap();

    expect(result.user.openId).toBe("bootstrap-user");
    expect(result.workspace).toEqual(workspace);
    expect(result.organizations).toEqual([workspace]);
    expect(db.ensurePersonalOrganization).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(db.getUserOrganizations).toHaveBeenCalledWith(7);
  });
});
