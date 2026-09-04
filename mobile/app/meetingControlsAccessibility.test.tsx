import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ title: "اجتماع اختبار", speaking: "ar", display: "en", inviteCode: "ABCDEFGH", share: "0" }), router: { push: vi.fn() } }));
vi.mock("expo-audio", () => ({ AudioModule: { requestRecordingPermissionsAsync: vi.fn() }, RecordingPresets: { HIGH_QUALITY: {} }, setAudioModeAsync: vi.fn(), useAudioRecorder: () => ({}), useAudioRecorderState: () => ({ isRecording: false }) }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { webBaseUrl: "https://example.test" } } } }));
vi.mock("expo-keep-awake", () => ({ useKeepAwake: vi.fn() }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: () => null }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../lib/meetingService", () => ({ getNativeMeetingForInvite: () => new Promise(() => undefined), transcribeRecording: vi.fn() }));
vi.mock("../lib/realtime", () => ({ joinManagedAudioRoom: vi.fn(), leaveManagedAudioRoom: vi.fn() }));
vi.mock("../lib/speech", () => ({ speakMeetingTranslation: vi.fn(), stopMeetingSpeech: vi.fn() }));
vi.mock("../lib/directPeer", () => ({ startDirectPeerAudio: vi.fn(), stopDirectPeerAudio: vi.fn() }));
vi.mock("../lib/preferences", () => ({ defaultMobilePreferences: { speechLanguage: "ar", displayLanguage: "en", voiceName: "natural", voiceRate: 1 }, loadMobilePreferences: () => new Promise(() => undefined) }));

import MeetingScreen from "./meeting";

describe("MeetingScreen control accessibility", () => {
  it("renders the connected meeting controls with labels and inactive states", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MeetingScreen />); });
    const controls = renderer!.root.findAll(node => String(node.type) === "Pressable" && node.props.accessibilityRole === "button");
    expect(controls.map(node => node.props.accessibilityLabel)).toEqual(expect.arrayContaining(["كتم الصوت", "تشغيل النسخ الحي", "صوت حي مُدار", "اتصال ثنائي مباشر"]));
    expect(controls.filter(node => ["كتم الصوت", "تشغيل النسخ الحي", "صوت حي مُدار", "اتصال ثنائي مباشر"].includes(node.props.accessibilityLabel)).every(node => node.props.accessibilityState.selected === false)).toBe(true);
    const liveStatus = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLiveRegion === "polite");
    expect(liveStatus.props.accessibilityRole).toBe("text");
    expect(liveStatus.props.accessibilityLabel).toBe("النص الحي متوقف");
  });

  it("aligns original and translated segments with their own Arabic or Latin direction", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MeetingScreen />); });
    const list = renderer!.root.find(node => String(node.type) === "FlatList");
    const getSegmentTextStyles = (index: number) => {
      const segment = list.props.renderItem({ item: list.props.data[index] }) as React.ReactElement<{ children: React.ReactNode }>;
      const [, dual] = React.Children.toArray(segment.props.children) as React.ReactElement<{ children: React.ReactNode }>[];
      const [original, translated] = React.Children.toArray(dual.props.children) as React.ReactElement<{ style: unknown }>[];
      return { original: original.props.style, translated: translated.props.style };
    };
    const arabicToEnglish = getSegmentTextStyles(0);
    const englishToArabic = getSegmentTextStyles(1);
    expect(arabicToEnglish.original).toEqual(expect.arrayContaining([expect.objectContaining({ textAlign: "right" })]));
    expect(arabicToEnglish.translated).toEqual(expect.arrayContaining([expect.objectContaining({ textAlign: "left" })]));
    expect(englishToArabic.original).toEqual(expect.arrayContaining([expect.objectContaining({ textAlign: "left" })]));
    expect(englishToArabic.translated).toEqual(expect.arrayContaining([expect.objectContaining({ textAlign: "right" })]));
  });
});
