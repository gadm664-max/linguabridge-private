import { describe, expect, it } from "vitest";
import { buildInviteShareMessage } from "./inviteShare";

describe("invite sharing", () => {
  it("builds a stable join link without duplicate slashes", () => {
    expect(buildInviteShareMessage("https://linguameet.example/", "ABCD2345", "مراجعة العقد")).toBe("دعوة إلى مراجعة العقد\nhttps://linguameet.example/join/ABCD2345");
  });
});
