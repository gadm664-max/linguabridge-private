import WebSocket from "ws";

type SpeechStreamTranscriptBase = {
  transcript: string;
  startSeconds: number;
  durationSeconds: number;
  rawType: "Results";
};

export type SpeechStreamTranscriptEvent =
  | (SpeechStreamTranscriptBase & { type: "partial" })
  | (SpeechStreamTranscriptBase & { type: "final" });

export type SpeechStreamEvent =
  | SpeechStreamTranscriptEvent
  | { type: "provider_error"; error: SpeechStreamError }
  | { type: "close" };

export class SpeechStreamError extends Error {
  constructor(
    public readonly code:
      | "AUTHENTICATION_FAILED"
      | "RATE_LIMITED"
      | "TIMEOUT"
      | "NETWORK_FAILURE"
      | "MALFORMED_RESPONSE",
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super("Speech streaming provider request failed");
    this.name = "SpeechStreamError";
  }
}

export type SpeechStreamOptions = {
  apiKey: string;
  language: string;
  model: string;
  endpoint?: string;
  interimResults?: boolean;
  endpointingMs?: number;
};

export interface SpeechStreamTransport {
  connect(): Promise<void>;
  sendAudio(audio: Buffer): void;
  close(): Promise<void>;
  reconnect(): Promise<void>;
  onEvent(listener: (event: SpeechStreamEvent) => void): () => void;
}

type DeepgramResultMessage = {
  type?: unknown;
  is_final?: unknown;
  start?: unknown;
  duration?: unknown;
  channel?: {
    alternatives?: Array<{ transcript?: unknown }>;
  };
};

type DeepgramErrorMessage = {
  type?: unknown;
  err_code?: unknown;
  status?: unknown;
  retry_after?: unknown;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseErrorCode(message: DeepgramErrorMessage) {
  const status = safeNumber(message.status || message.err_code);
  if (status === 401 || status === 403)
    return { code: "AUTHENTICATION_FAILED" as const, statusCode: 502 };
  if (status === 429)
    return {
      code: "RATE_LIMITED" as const,
      statusCode: 429,
      retryAfterMs: safeNumber(message.retry_after) || undefined,
    };
  return { code: "NETWORK_FAILURE" as const, statusCode: 503 };
}

export class DeepgramWebSocketTransport implements SpeechStreamTransport {
  private socket: WebSocket | undefined;
  private readonly listeners = new Set<(event: SpeechStreamEvent) => void>();
  private readonly url: string;
  private readonly connectTimeoutMs: number;

  constructor(
    private readonly options: SpeechStreamOptions,
    connectTimeoutMs = 20_000
  ) {
    this.connectTimeoutMs = connectTimeoutMs;
    const endpoint = options.endpoint || "wss://api.deepgram.com/v1/listen";
    const url = new URL(endpoint);
    url.searchParams.set("model", options.model);
    url.searchParams.set("language", options.language);
    url.searchParams.set(
      "interim_results",
      String(options.interimResults ?? true)
    );
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("endpointing", String(options.endpointingMs ?? 300));
    this.url = url.toString();
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(this.url, {
      headers: { Authorization: `Token ${this.options.apiKey}` },
    });
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.terminate();
        const error = new SpeechStreamError("TIMEOUT", 504);
        this.emit({ type: "provider_error", error });
        reject(error);
      }, this.connectTimeoutMs);

      socket.once("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const error = new SpeechStreamError("NETWORK_FAILURE", 503);
        this.emit({ type: "provider_error", error });
        reject(error);
      });
    });

    socket.on("message", data => this.handleMessage(data.toString()));
    socket.on("close", () => this.emit({ type: "close" }));
    socket.on("error", () => {
      this.emit({
        type: "provider_error",
        error: new SpeechStreamError("NETWORK_FAILURE", 503),
      });
    });
  }

  sendAudio(audio: Buffer) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new SpeechStreamError("NETWORK_FAILURE", 503);
    }
    this.socket.send(audio);
  }

  async close() {
    const socket = this.socket;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "CloseStream" }));
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 2_000);
        socket.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
  }

  async reconnect() {
    await this.close();
    this.socket = undefined;
    await this.connect();
  }

  onEvent(listener: (event: SpeechStreamEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleMessage(rawMessage: string) {
    let message: unknown;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.emit({
        type: "provider_error",
        error: new SpeechStreamError("MALFORMED_RESPONSE", 502),
      });
      return;
    }

    if (!message || typeof message !== "object") {
      this.emit({
        type: "provider_error",
        error: new SpeechStreamError("MALFORMED_RESPONSE", 502),
      });
      return;
    }

    const typedMessage = message as DeepgramResultMessage;
    if (typedMessage.type === "Results") {
      const transcript =
        typeof typedMessage.channel?.alternatives?.[0]?.transcript === "string"
          ? typedMessage.channel.alternatives[0].transcript.trim()
          : "";
      if (!transcript) return;
      this.emit({
        type: typedMessage.is_final === true ? "final" : "partial",
        transcript,
        startSeconds: safeNumber(typedMessage.start),
        durationSeconds: safeNumber(typedMessage.duration),
        rawType: "Results",
      });
      return;
    }

    if (typedMessage.type === "Error") {
      const errorDetails = parseErrorCode(message as DeepgramErrorMessage);
      this.emit({
        type: "provider_error",
        error: new SpeechStreamError(
          errorDetails.code,
          errorDetails.statusCode,
          errorDetails.retryAfterMs
        ),
      });
    }
  }

  private emit(event: SpeechStreamEvent) {
    for (const listener of Array.from(this.listeners)) listener(event);
  }
}
