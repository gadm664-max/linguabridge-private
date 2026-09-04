import { describe, expect, it } from "vitest";
import { readNativeReturnUri } from "./oauth";

describe("native OAuth return URI validation", () => {
  it("accepts only the LinguaBridge OAuth deep link", () => {
    const target = readNativeReturnUri("https://api.example.com/api/oauth/native/callback?return_to=linguabridge%3A%2F%2Foauth");
    expect(target?.toString()).toBe("linguabridge://oauth");
  });

  it("rejects web and arbitrary deep-link return targets", () => {
    expect(readNativeReturnUri("https://api.example.com/api/oauth/native/callback?return_to=https%3A%2F%2Fevil.example.com")).toBeNull();
    expect(readNativeReturnUri("https://api.example.com/api/oauth/native/callback?return_to=linguabridge%3A%2F%2Fsettings")).toBeNull();
  });
});
