import crypto from "crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { claimExternalWebhookEvent, getWhatsAppOptIn, setWhatsAppOptIn } from "./db";
import { ENV } from "./_core/env";
import { transcribeAudioBuffer } from "./_core/voiceTranscription";
import { translateMeetingText } from "./services/translationService";

const META_GRAPH_BASE_URL = "https://graph.facebook.com/v26.0";
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const supportedTargetLanguages = new Set(["ar", "en", "fr", "es", "ja"]);

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  configured: boolean;
};

type IncomingMessage = {
  id: string;
  from: string;
  type: "text" | "audio";
  text?: string;
  audioId?: string;
  mimeType?: string;
};

export function getWhatsAppConfig(env = ENV): WhatsAppConfig {
  const accessToken = env.whatsappAccessToken;
  const phoneNumberId = env.whatsappPhoneNumberId;
  const appSecret = env.whatsappAppSecret;
  const verifyToken = env.whatsappWebhookVerifyToken;
  return { accessToken, phoneNumberId, appSecret, verifyToken, configured: Boolean(accessToken && phoneNumberId && appSecret && verifyToken) };
}

export function hashWhatsAppSender(sender: string) {
  return crypto.createHash("sha256").update(sender.trim()).digest("hex");
}

export function safeSecretEqual(received: string, expected: string) {
  const receivedValue = Buffer.from(received);
  const expectedValue = Buffer.from(expected);
  return receivedValue.length === expectedValue.length && crypto.timingSafeEqual(receivedValue, expectedValue);
}

export function verifyWhatsAppSignature(rawBody: Buffer, header: string | undefined, appSecret: string) {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function parseIncomingMessages(payload: unknown): IncomingMessage[] {
  const root = payload as { object?: string; entry?: Array<{ changes?: Array<{ value?: { messages?: Array<any> } }> }> };
  if (root?.object !== "whatsapp_business_account") return [];
  const messages: IncomingMessage[] = [];
  for (const entry of root.entry ?? []) for (const change of entry.changes ?? []) for (const message of change.value?.messages ?? []) {
    if (!message?.id || !message?.from) continue;
    if (message.type === "text" && typeof message.text?.body === "string") messages.push({ id: message.id, from: message.from, type: "text", text: message.text.body });
    if (message.type === "audio" && typeof message.audio?.id === "string") messages.push({ id: message.id, from: message.from, type: "audio", audioId: message.audio.id, mimeType: message.audio.mime_type });
  }
  return messages;
}

function isOptInCommand(text: string) {
  return /^(ابدأ|موافقة|start|consent)$/i.test(text.trim());
}

function isOptOutCommand(text: string) {
  return /^(إيقاف|الغاء|إلغاء|stop|cancel)$/i.test(text.trim());
}

function requestedLanguage(text: string) {
  const match = text.trim().match(/^(?:لغة|language)\s+(ar|en|fr|es|ja)$/i);
  return match?.[1].toLowerCase();
}

async function sendWhatsAppText(to: string, body: string, config: WhatsAppConfig) {
  const response = await fetch(`${META_GRAPH_BASE_URL}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: body.slice(0, 4000) } }),
  });
  if (!response.ok) throw new Error(`WhatsApp send failed: ${response.status}`);
}

async function downloadWhatsAppAudio(mediaId: string, config: WhatsAppConfig) {
  const metadata = await fetch(`${META_GRAPH_BASE_URL}/${mediaId}`, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!metadata.ok) throw new Error(`WhatsApp media metadata failed: ${metadata.status}`);
  const media = await metadata.json() as { url?: string; mime_type?: string; file_size?: number };
  if (!media.url || (media.file_size ?? 0) > MAX_AUDIO_BYTES) throw new Error("WhatsApp audio is unavailable or exceeds 16MB");
  const response = await fetch(media.url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
  if (!response.ok) throw new Error(`WhatsApp media download failed: ${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error("WhatsApp audio exceeds 16MB");
  return { audio, mimeType: media.mime_type || "audio/ogg" };
}

async function respondToText(message: IncomingMessage, senderHash: string, config: WhatsAppConfig) {
  const text = message.text?.trim() ?? "";
  if (!text) return;
  if (isOptInCommand(text)) {
    await setWhatsAppOptIn({ senderHash, optedIn: true });
    await sendWhatsAppText(message.from, "تم تفعيل ترجمة LinguaBridge لهذه المحادثة. أرسل نصًا أو رسالة صوتية، أو اكتب «لغة en» لتحديد لغة الترجمة. أرسل «إيقاف» لإلغاء الموافقة.", config);
    return;
  }
  if (isOptOutCommand(text)) {
    await setWhatsAppOptIn({ senderHash, optedIn: false });
    await sendWhatsAppText(message.from, "تم إيقاف معالجة رسائلك. لن نعالج رسائل جديدة حتى ترسل «ابدأ» مرة أخرى.", config);
    return;
  }
  const language = requestedLanguage(text);
  if (language && supportedTargetLanguages.has(language)) {
    const current = await getWhatsAppOptIn(senderHash);
    await setWhatsAppOptIn({ senderHash, optedIn: current?.optedIn ?? false, targetLanguage: language });
    await sendWhatsAppText(message.from, `تم ضبط لغة الترجمة إلى ${language}.`, config);
    return;
  }
  const optIn = await getWhatsAppOptIn(senderHash);
  if (!optIn?.optedIn) {
    await sendWhatsAppText(message.from, "لحماية خصوصيتك، أرسل «ابدأ» أولًا للموافقة على معالجة النص أو الصوت لهذه المحادثة. يمكنك الإلغاء لاحقًا بكلمة «إيقاف».", config);
    return;
  }
  const translated = await translateMeetingText({ text, sourceLanguage: "the sender's language", targetLanguage: optIn.targetLanguage });
  await sendWhatsAppText(message.from, `الترجمة (${optIn.targetLanguage}):\n${translated.translation}`, config);
}

async function respondToAudio(message: IncomingMessage, senderHash: string, config: WhatsAppConfig) {
  const optIn = await getWhatsAppOptIn(senderHash);
  if (!optIn?.optedIn) {
    await sendWhatsAppText(message.from, "لحماية خصوصيتك، أرسل «ابدأ» قبل معالجة أي رسالة صوتية.", config);
    return;
  }
  if (!message.audioId) return;
  const { audio, mimeType } = await downloadWhatsAppAudio(message.audioId, config);
  const transcription = await transcribeAudioBuffer({ audio, mimeType, prompt: "Transcribe this WhatsApp voice message accurately." });
  if ("error" in transcription) throw new Error(transcription.error);
  const translated = await translateMeetingText({ text: transcription.text, sourceLanguage: transcription.language || "the sender's language", targetLanguage: optIn.targetLanguage });
  await sendWhatsAppText(message.from, `النص:\n${transcription.text}\n\nالترجمة (${optIn.targetLanguage}):\n${translated.translation}`, config);
}

async function processMessage(message: IncomingMessage, config: WhatsAppConfig) {
  try {
    if (!(await claimExternalWebhookEvent("whatsapp", message.id))) return;
    const senderHash = hashWhatsAppSender(message.from);
    if (message.type === "text") await respondToText(message, senderHash, config);
    if (message.type === "audio") await respondToAudio(message, senderHash, config);
  } catch (error) {
    console.error("[WhatsApp] Processing failed", { eventId: message.id, reason: error instanceof Error ? error.message : "unknown" });
  }
}

export function registerWhatsAppWebhookRoutes(app: Express) {
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const config = getWhatsAppConfig();
    if (!config.verifyToken) return res.status(503).json({ error: "WhatsApp webhook is not configured" });
    const mode = typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : "";
    const verifyToken = typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : "";
    const challenge = typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : "";
    if (mode !== "subscribe" || !challenge || !safeSecretEqual(verifyToken, config.verifyToken)) return res.sendStatus(403);
    return res.status(200).send(challenge);
  });

  app.post("/api/whatsapp/webhook", express.raw({ type: "application/json", limit: "3mb" }), (req: Request, res: Response) => {
    const config = getWhatsAppConfig();
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.header("x-hub-signature-256") ?? undefined;
    if (!config.configured || !verifyWhatsAppSignature(rawBody, signature, config.appSecret)) return res.sendStatus(403);
    let payload: unknown;
    try { payload = JSON.parse(rawBody.toString("utf8")); } catch { return res.sendStatus(400); }
    const messages = parseIncomingMessages(payload);
    res.sendStatus(200);
    for (const message of messages) void processMessage(message, config);
  });
}
