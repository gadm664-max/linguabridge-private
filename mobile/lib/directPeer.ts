import { AudioSession } from "@livekit/react-native";
import {
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from "@livekit/react-native-webrtc";
import { io, type Socket } from "socket.io-client";
import { requireApiBaseUrl } from "./config";
import { getSessionToken } from "./session";

type PeerSignal = {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
};

let socket: Socket | null = null;
let connection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteSocketId = "";

function emitSignal(signal: PeerSignal) {
  if (!socket || !remoteSocketId) return;
  socket.emit("signal", { targetSocketId: remoteSocketId, signal });
}

async function makeOffer() {
  if (!connection) return;
  const offer = await connection.createOffer({ offerToReceiveAudio: true });
  await connection.setLocalDescription(offer);
  emitSignal({ type: "offer", sdp: offer.sdp ?? "" });
}

async function handleSignal(signal: PeerSignal) {
  if (!connection) return;
  if (signal.type === "offer" && signal.sdp) {
    await connection.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }));
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    emitSignal({ type: "answer", sdp: answer.sdp ?? "" });
  } else if (signal.type === "answer" && signal.sdp) {
    await connection.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
  } else if (signal.type === "ice" && signal.candidate) {
    await connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
  }
}

export async function startDirectPeerAudio(inviteCode: string, onState?: (state: string) => void) {
  const token = await getSessionToken();
  if (!token) throw new Error("سجّل الدخول قبل بدء اتصال صوتي مباشر.");
  await stopDirectPeerAudio();
  await AudioSession.startAudioSession();
  localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
  connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  localStream.getTracks().forEach(track => connection?.addTrack(track, localStream as MediaStream));
  connection.onicecandidate = event => {
    const candidate = (event as unknown as { candidate?: { toJSON: () => PeerSignal["candidate"] } }).candidate;
    if (candidate) emitSignal({ type: "ice", candidate: candidate.toJSON() });
  };
  connection.onconnectionstatechange = () => onState?.(connection?.connectionState ?? "new");

  socket = io(requireApiBaseUrl(), {
    path: "/api/realtime",
    transports: ["websocket"],
    auth: { token },
  });
  await new Promise<void>((resolve, reject) => {
    socket?.once("connect", () => resolve());
    socket?.once("connect_error", error => reject(new Error(error.message || "تعذر الاتصال بقناة الإشارات.")));
  });

  socket.on("peer:joined", ({ socketId }: { socketId: string }) => {
    remoteSocketId = socketId;
    onState?.("peer-ready");
  });
  socket.on("signal", ({ fromSocketId, signal }: { fromSocketId: string; signal: PeerSignal }) => {
    remoteSocketId = fromSocketId;
    void handleSignal(signal);
  });

  const joinResult = await new Promise<{ ok: boolean; peers?: string[]; error?: string }>(resolve => {
    socket?.emit("room:join", { inviteCode }, resolve);
  });
  if (!joinResult.ok) throw new Error(joinResult.error || "تعذر بدء الاتصال المباشر.");
  if (joinResult.peers?.[0]) {
    remoteSocketId = joinResult.peers[0];
    await makeOffer();
  }
  onState?.("waiting-for-peer");
}

export async function stopDirectPeerAudio() {
  socket?.emit("room:leave");
  socket?.disconnect();
  socket = null;
  remoteSocketId = "";
  localStream?.getTracks().forEach(track => track.stop());
  localStream = null;
  connection?.close();
  connection = null;
  await AudioSession.stopAudioSession();
}
