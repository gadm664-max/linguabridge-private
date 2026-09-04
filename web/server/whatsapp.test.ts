import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { hashWhatsAppSender, parseIncomingMessages, safeSecretEqual, verifyWhatsAppSignature } from "./whatsapp";

describe("WhatsApp webhook safety", () => {
  it("accepts a valid HMAC signature and rejects a modified payload", () => {
    const secret = "secret";
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature, secret)).toBe(true);
    expect(verifyWhatsAppSignature(Buffer.from("changed"), signature, secret)).toBe(false);
  });

  it("extracts only supported text and audio message fields", () => {
    const messages = parseIncomingMessages({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [{ id: "a", from: "15551234567", type: "text", text: { body: "ابدأ" } }, { id: "b", from: "15551234567", type: "audio", audio: { id: "media-1", mime_type: "audio/ogg" } }] } }] }] });
    expect(messages).toEqual([{ id: "a", from: "15551234567", type: "text", text: "ابدأ" }, { id: "b", from: "15551234567", type: "audio", audioId: "media-1", mimeType: "audio/ogg" }]);
    expect(hashWhatsAppSender("15551234567")).not.toContain("15551234567");
  });

  it("rejects different-length verification tokens without throwing", () => {
    expect(safeSecretEqual("wrong", "longer-secret")).toBe(false);
  });
});
