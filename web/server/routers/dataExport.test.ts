import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";

describe("account data export access", () => {
  it("rejects unauthenticated export requests before any account data is read", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as never, res: {} as never });
    await expect(caller.meetings.dataExport()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
