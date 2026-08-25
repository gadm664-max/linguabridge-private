import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getNativeMeetingMinutes: vi.fn() }));

vi.mock("expo-router", () => ({ router: { back: vi.fn(), push: vi.fn() }, useLocalSearchParams: () => ({ inviteCode: "ABCDEFGH", title: "جلسة اختبار" }) }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: (props: Record<string, unknown>) => React.createElement("PrimaryButton", props) }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../lib/meetingService", () => ({ getNativeMeetingMinutes: mocks.getNativeMeetingMinutes }));

import MinutesScreen from "./minutes";

describe("MinutesScreen verified minutes", () => {
  beforeEach(() => { mocks.getNativeMeetingMinutes.mockReset(); });

  it("announces loading while verified minutes are requested", () => {
    mocks.getNativeMeetingMinutes.mockImplementation(() => new Promise(() => undefined));
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MinutesScreen />); });
    expect(renderer!.root.find(node => node.props.accessibilityLabel === "جارٍ تحميل المحضر الموثق").props.accessibilityLiveRegion).toBe("polite");
  });

  it("shows the transparent empty state when no approved minutes exist", async () => {
    mocks.getNativeMeetingMinutes.mockResolvedValue({ meeting: {}, minutes: null, segments: [] });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<MinutesScreen />); await Promise.resolve(); });
    expect(renderer!.root.find(node => node.props.accessibilityLabel?.includes("لا يوجد محضر موثق")).props.accessibilityLiveRegion).toBe("polite");
  });

  it("renders only verified server minutes when they are available", async () => {
    mocks.getNativeMeetingMinutes.mockResolvedValue({ meeting: {}, minutes: { summary: "ملخص موثق", keyPoints: ["نقطة موثقة"], actionItems: ["إجراء موثق"] }, segments: [] });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<MinutesScreen />); await Promise.resolve(); });
    const renderedText = renderer!.root.findAll(node => String(node.type) === "Text").flatMap(node => node.children).join("");
    expect(renderedText).toContain("ملخص موثق");
    expect(renderedText).toContain("نقطة موثقة");
    expect(renderedText).toContain("إجراء موثق");
  });

  it("announces a recoverable error when verified minutes cannot be loaded", async () => {
    mocks.getNativeMeetingMinutes.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ meeting: {}, minutes: null, segments: [] });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<MinutesScreen />); await Promise.resolve(); });
    expect(renderer!.root.find(node => node.props.accessibilityLabel?.includes("تعذر تحميل المحضر")).props.accessibilityLiveRegion).toBe("polite");
    const retry = renderer!.root.find(node => String(node.type) === "PrimaryButton" && node.props.title === "إعادة المحاولة");
    await act(async () => { retry.props.onPress(); await Promise.resolve(); });
    expect(mocks.getNativeMeetingMinutes).toHaveBeenCalledTimes(2);
    expect(renderer!.root.find(node => node.props.accessibilityLabel?.includes("لا يوجد محضر موثق")).props.accessibilityLiveRegion).toBe("polite");
  });
});
