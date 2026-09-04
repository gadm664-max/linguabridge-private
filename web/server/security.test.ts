import { describe, expect, it, vi } from "vitest";
import { sameOriginGuard } from "./security";

describe("sameOriginGuard", () => {
  const createResponse = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  });

  it("allows requests without Origin for non-browser clients", () => {
    const next = vi.fn();
    const res = createResponse();
    sameOriginGuard({ headers: {} } as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows the same origin and rejects a different origin", () => {
    const next = vi.fn();
    const res = createResponse();
    const request = {
      headers: { origin: "https://lingua.example.com" },
      protocol: "https",
      get: vi.fn().mockReturnValue("lingua.example.com"),
    };
    sameOriginGuard(request as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();

    const rejectedNext = vi.fn();
    const rejectedResponse = createResponse();
    sameOriginGuard(
      { ...request, headers: { origin: "https://evil.example.com" } } as never,
      rejectedResponse as never,
      rejectedNext
    );
    expect(rejectedNext).not.toHaveBeenCalled();
    expect(rejectedResponse.status).toHaveBeenCalledWith(403);
    expect(rejectedResponse.json).toHaveBeenCalledWith({
      error: { code: "CSRF_ORIGIN_MISMATCH", message: "Origin is not allowed" },
    });
  });
});
