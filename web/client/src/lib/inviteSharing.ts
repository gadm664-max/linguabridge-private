export function isInviteSharingEnabled(search: string) {
  return new URLSearchParams(search).get("share") !== "0";
}
