import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ router: { back: vi.fn(), push: vi.fn() } }));
vi.mock("expo-audio", () => ({ AudioModule: { requestRecordingPermissionsAsync: vi.fn() }, setAudioModeAsync: vi.fn() }));
vi.mock("../components/Brand", () => ({ Brand: () => null }));
vi.mock("../components/LanguageChoiceGroup", () => ({ LanguageChoiceGroup: () => null }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: () => null }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../lib/meetingService", () => ({ createNativeMeeting: vi.fn() }));
vi.mock("../lib/session", () => ({ getSessionToken: vi.fn(), signInWithLinguaBridge: vi.fn() }));
vi.mock("../lib/preferences", () => ({
  defaultMobilePreferences: { speechLanguage: "ar", displayLanguage: "en", voiceName: "natural", voiceRate: 1 },
  loadMobilePreferences: () => new Promise(() => undefined),
}));

import LobbyScreen from "./lobby";

describe("LobbyScreen invite sharing accessibility", () => {
  it("labels the invite-sharing switch and exposes its enabled state", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<LobbyScreen />); });
    const inviteSwitch = renderer!.root.find(node => String(node.type) === "Switch" && node.props.accessibilityLabel === "تفعيل أو إيقاف أدوات مشاركة رابط الدعوة");
    expect(inviteSwitch.props.accessibilityRole).toBe("switch");
    expect(inviteSwitch.props.accessibilityState).toEqual({ checked: true });
  });
});
