import { isInviteSharingEnabled } from "./inviteSharing";

export function resolveInviteSharingEnabled(input: {
  inviteCode?: string;
  share?: string;
  serverPolicy?: boolean;
}) {
  if (typeof input.serverPolicy === "boolean") return input.serverPolicy;
  return input.inviteCode ? false : isInviteSharingEnabled(input.share);
}

export function buildNativeMeetingRouteParams(input: {
  meeting: { title: string; inviteCode: string; inviteSharingEnabled: boolean };
  speaking: string;
  display: string;
}) {
  return {
    title: input.meeting.title,
    speaking: input.speaking,
    display: input.display,
    inviteCode: input.meeting.inviteCode,
    share: input.meeting.inviteSharingEnabled ? "1" : "0",
  };
}
