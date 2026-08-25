import { AudioSession } from "@livekit/react-native";
import { Room } from "livekit-client";
import { issueManagedRoomToken } from "./meetingService";

let activeRoom: Room | null = null;

export async function joinManagedAudioRoom(inviteCode: string) {
  const credentials = await issueManagedRoomToken(inviteCode);
  await leaveManagedAudioRoom();
  await AudioSession.startAudioSession();
  const room = new Room();
  await room.connect(credentials.serverUrl, credentials.participantToken);
  await room.localParticipant.setMicrophoneEnabled(true);
  activeRoom = room;
  return { roomName: credentials.roomName, expiresInSeconds: credentials.expiresInSeconds };
}

export async function leaveManagedAudioRoom() {
  if (activeRoom) {
    await activeRoom.disconnect();
    activeRoom = null;
  }
  await AudioSession.stopAudioSession();
}
