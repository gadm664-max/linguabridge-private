import type { Request } from "express";
import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { getMeetingForInvite, isActiveMeetingParticipant, isMeetingPersistenceAllowed } from "./db";
import { sdk, type AuthenticatedUser } from "./_core/sdk";

type PeerSignal = {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
};

type SocketData = {
  user: AuthenticatedUser;
  roomName?: string;
};

type LinguaSocket = Socket & { data: SocketData };

export function isSafePeerSignal(value: unknown): value is PeerSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Record<string, unknown>;
  if (signal.type === "offer" || signal.type === "answer") {
    return typeof signal.sdp === "string" && signal.sdp.length > 0 && signal.sdp.length < 100_000;
  }
  if (signal.type === "ice") {
    return Boolean(signal.candidate && typeof signal.candidate === "object");
  }
  return false;
}

function directRoomName(meetingId: number) {
  return `direct-audio-${meetingId}`;
}

export function registerRealtimeGateway(server: HttpServer) {
  const io = new Server(server, {
    path: "/api/realtime",
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    if (!token) return next(new Error("Authentication is required"));
    try {
      const user = await sdk.authenticateRequest({
        headers: { authorization: `Bearer ${token}` },
      } as Request);
      (socket.data as SocketData).user = user;
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", socket => {
    const peerSocket = socket as LinguaSocket;

    peerSocket.on("room:join", async (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const inviteCode = typeof (payload as { inviteCode?: unknown })?.inviteCode === "string"
          ? (payload as { inviteCode: string }).inviteCode.trim().toUpperCase()
          : "";
        const meeting = await getMeetingForInvite(inviteCode);
        if (!meeting) throw new Error("Invitation not found");
        if (!(await isActiveMeetingParticipant(meeting.id, peerSocket.data.user.id))) {
          throw new Error("Join the meeting before starting direct audio");
        }
        if (!(await isMeetingPersistenceAllowed(meeting.id))) {
          throw new Error("All active participants must consent before starting direct audio");
        }

        const roomName = directRoomName(meeting.id);
        const peers = Array.from(io.sockets.adapter.rooms.get(roomName) ?? []);
        if (peers.length >= 1) {
          throw new Error("Direct audio preview supports two participants only");
        }
        peerSocket.data.roomName = roomName;
        await peerSocket.join(roomName);
        acknowledge?.({ ok: true, peers });
        peerSocket.to(roomName).emit("peer:joined", { socketId: peerSocket.id });
      } catch (error) {
        acknowledge?.({ ok: false, error: error instanceof Error ? error.message : "Unable to join direct audio" });
      }
    });

    peerSocket.on("signal", async (payload: unknown, acknowledge?: (result: unknown) => void) => {
      const targetSocketId = typeof (payload as { targetSocketId?: unknown })?.targetSocketId === "string"
        ? (payload as { targetSocketId: string }).targetSocketId
        : "";
      const signal = (payload as { signal?: unknown })?.signal;
      const roomName = peerSocket.data.roomName;
      if (!roomName || !targetSocketId || !isSafePeerSignal(signal)) {
        acknowledge?.({ ok: false, error: "Invalid signaling message" });
        return;
      }
      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      if (!roomSockets?.has(targetSocketId)) {
        acknowledge?.({ ok: false, error: "Peer is not in the direct-audio room" });
        return;
      }
      io.to(targetSocketId).emit("signal", { fromSocketId: peerSocket.id, signal });
      acknowledge?.({ ok: true });
    });

    peerSocket.on("room:leave", () => {
      peerSocket.data.roomName = undefined;
    });
    peerSocket.on("disconnect", () => {
      peerSocket.data.roomName = undefined;
    });
  });

  return io;
}
