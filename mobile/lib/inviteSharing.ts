export function isInviteSharingEnabled(value: string | undefined) {
  return value !== "0";
}

const inviteCodePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/;

export function normalizeInviteCode(value: string) {
  const directCode = value.trim().toUpperCase();
  if (inviteCodePattern.test(directCode)) return directCode;

  const fromPath = value.match(/\/join\/([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16})(?:[/?#]|$)/i)?.[1];
  const fromQuery = value.match(/[?&]inviteCode=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16})(?:[&#]|$)/i)?.[1];
  const extracted = fromPath ?? fromQuery;
  return extracted ? extracted.toUpperCase() : "";
}
