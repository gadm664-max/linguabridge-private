import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeepgramWebSocketTransport,
  type SpeechStreamEvent,
} from "./speechStreamTransport";

type Handler = (...args: unknown[]) => void;

const { MockWebSocket, sockets } = vi.hoisted(() => {
  class HoistedMockWebSocket {
    static readonly OPEN = 1;
    static readonly CONNECTING = 0;
    readonly sent: Array<Buffer | string> = [];
    readyState = HoistedMockWebSocket.CONNECTING;
    private readonly handlers = new Map<string, Handler[]>();

    constructor(
      readonly url: string,
      readonly options: { headers?: Record<string, string> }
    ) {
      sockets.push(this);
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }

    once(event: string, handler: Handler) {
      const onceHandler: Handler = (...args) => {
        this.handlers.set(
          event,
          (this.handlers.get(event) ?? []).filter(item => item !== onceHandler)
        );
        handler(...args);
      };
      return this.on(event, onceHandler);
    }

    send(payload: Buffer | string) {
      this.sent.push(payload);
    }

    terminate() {
      this.readyState = 3;
      this.emit("close");
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of [...(this.handlers.get(event) ?? [])]) {
        handler(...args);
      }
    }
  }

  const sockets: HoistedMockWebSocket[] = [];
  return { MockWebSocket: HoistedMockWebSocket, sockets };
});

vi.mock("ws", () => ({
  default: MockWebSocket,
}));

describe("DeepgramWebSocketTransport", () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it("connects with server-side auth and parses partial/final results", async () => {
    const transport = new DeepgramWebSocketTransport({
      apiKey: "test-only-injected-transport-key",
      language: "ar-EG",
      model: "nova-3",
    });
    const events: SpeechStreamEvent[] = [];
    transport.onEvent(event => events.push(event));

    const connected = transport.connect();
    const socket = sockets[0];
    socket.readyState = MockWebSocket.OPEN;
    socket.emit("open");
    await connected;

    expect(socket.url).toContain("model=nova-3");
    expect(socket.url).toContain("language=ar-EG");
    expect(socket.url).toContain("interim_results=true");
    expect(socket.options.headers?.Authorization).toBe(
      "Token test-only-injected-transport-key"
    );

    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "Results",
          is_final: false,
          start: 0,
          duration: 0.5,
          channel: { alternatives: [{ transcript: "مرحبا" }] },
        })
      )
    );
    socket.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          type: "Results",
          is_final: true,
          start: 0,
          duration: 1.2,
          channel: { alternatives: [{ transcript: "مرحبا بالعالم" }] },
        })
      )
    );

    expect(events).toEqual([
      {
        type: "partial",
        transcript: "مرحبا",
        startSeconds: 0,
        durationSeconds: 0.5,
        rawType: "Results",
      },
      {
        type: "final",
        transcript: "مرحبا بالعالم",
        startSeconds: 0,
        durationSeconds: 1.2,
        rawType: "Results",
      },
    ]);

    transport.sendAudio(Buffer.from([1, 2, 3]));
    expect(socket.sent).toContainEqual(Buffer.from([1, 2, 3]));

    const closed = transport.close();
    socket.emit("close");
    await closed;
    expect(socket.sent).toContain(JSON.stringify({ type: "CloseStream" }));
  });

  it("reconnects by closing the old socket and opening a new one", async () => {
    const transport = new DeepgramWebSocketTransport({
      apiKey: "test-only-injected-transport-key",
      language: "en-US",
      model: "nova-3",
    });
    const firstConnect = transport.connect();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].emit("open");
    await firstConnect;

    const reconnect = transport.reconnect();
    sockets[0].emit("close");
    await new Promise(resolve => setTimeout(resolve, 0));
    const secondSocket = sockets[1];
    secondSocket.readyState = MockWebSocket.OPEN;
    secondSocket.emit("open");
    await reconnect;

    expect(sockets).toHaveLength(2);
    expect(secondSocket.url).toContain("language=en-US");
  });
});
