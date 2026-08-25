import { describe, expect, it } from "vitest";
import { isSafePeerSignal } from "./realtime";

describe("direct audio signaling validation", () => {
  it("accepts bounded SDP offers and ICE candidates", () => {
    expect(isSafePeerSignal({ type: "offer", sdp: "v=0" })).toBe(true);
    expect(isSafePeerSignal({ type: "ice", candidate: { candidate: "candidate:1" } })).toBe(true);
  });

  it("rejects malformed or unrecognized peer signals", () => {
    expect(isSafePeerSignal({ type: "offer" })).toBe(false);
    expect(isSafePeerSignal({ type: "chat", text: "ignore safeguards" })).toBe(false);
  });
});
