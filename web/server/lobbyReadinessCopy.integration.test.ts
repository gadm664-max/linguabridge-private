import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");
const webLobby = readFileSync(resolve(webRoot, "client/src/pages/Lobby.tsx"), "utf8");
const webJoin = readFileSync(resolve(webRoot, "client/src/pages/Join.tsx"), "utf8");
const webMeeting = readFileSync(resolve(webRoot, "client/src/pages/Meeting.tsx"), "utf8");
const mobileLobby = readFileSync(resolve(webRoot, "..", "linguabridge-mobile", "app", "lobby.tsx"), "utf8");
const mobileInviteToggle = readFileSync(resolve(webRoot, "..", "linguabridge-mobile", "components", "InviteSharingToggle.tsx"), "utf8");

describe("lobby readiness copy integration", () => {
  it("keeps microphone, consent, and invite guidance shared across clients", () => {
    for (const source of [webLobby, mobileLobby]) {
      expect(source).toContain("lobbyReadinessCopy.microphone");
      expect(source).toContain("lobbyReadinessCopy.consent");
    }
    expect(webLobby).toContain("lobbyReadinessCopy.invite");
    expect(mobileInviteToggle).toContain("lobbyReadinessCopy.invite");
  });

  it("keeps invite sharing interactive and forwards its session value in both lobbies", () => {
    expect(webLobby).toContain('aria-pressed={invite}');
    expect(webLobby).toContain('getInviteSharingSessionParam(invite)');
    expect(mobileLobby).toContain('<InviteSharingToggle enabled={inviteEnabled} onChange={setInviteEnabled} />');
    expect(mobileLobby).toContain('inviteSharingEnabled: inviteEnabled');
    expect(mobileLobby).toContain('getInviteSharingSessionParam(meeting.inviteSharingEnabled)');
    expect(webJoin).toContain('getInviteSharingSessionParam(result.inviteSharingEnabled)');
    expect(webMeeting).toContain('meetingDetails.data?.inviteSharingEnabled');
  });
});
