import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");
const webLobby = readFileSync(resolve(webRoot, "client/src/pages/Lobby.tsx"), "utf8");
const mobileLobby = readFileSync(resolve(webRoot, "..", "linguabridge-mobile", "app", "lobby.tsx"), "utf8");

describe("lobby readiness copy integration", () => {
  it("keeps microphone, consent, and invite guidance shared across clients", () => {
    for (const source of [webLobby, mobileLobby]) {
      expect(source).toContain("lobbyReadinessCopy.microphone");
      expect(source).toContain("lobbyReadinessCopy.consent");
      expect(source).toContain("lobbyReadinessCopy.invite");
    }
  });

  it("keeps invite sharing interactive and forwards its session value in both lobbies", () => {
    expect(webLobby).toContain('aria-pressed={invite}');
    expect(webLobby).toContain('getInviteSharingSessionParam(invite)');
    expect(mobileLobby).toContain('Switch value={inviteEnabled}');
    expect(mobileLobby).toContain('getInviteSharingSessionParam(inviteEnabled)');
  });
});
