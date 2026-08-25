import { describe, expect, it } from "vitest";
import { calculateAudioLevel } from "./audioInput";

describe("calculateAudioLevel", () => {
  it("returns zero for silence or an empty signal", () => {
    expect(calculateAudioLevel(new Uint8Array())).toBe(0);
    expect(calculateAudioLevel(new Uint8Array([128, 128, 128, 128]))).toBe(0);
  });

  it("returns a positive bounded value for a changing microphone signal", () => {
    expect(calculateAudioLevel(new Uint8Array([96, 160, 96, 160]))).toBeGreaterThan(0);
    expect(calculateAudioLevel(new Uint8Array([0, 255, 0, 255]))).toBeLessThanOrEqual(100);
  });
});
