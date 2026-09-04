const inviteAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function isValidInviteCode(value: string) {
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/.test(value);
}

export function buildInvitePath(inviteCode: string) {
  if (!isValidInviteCode(inviteCode)) {
    throw new Error("Invalid meeting invite code");
  }
  return `/join/${inviteCode}`;
}

export function createInviteCode(random: () => number = Math.random, length = 10) {
  if (!Number.isInteger(length) || length < 8 || length > 16) {
    throw new Error("Invite code length must be between 8 and 16");
  }
  return Array.from({ length }, () => inviteAlphabet[Math.floor(random() * inviteAlphabet.length)]).join("");
}
