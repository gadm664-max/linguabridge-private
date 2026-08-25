import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getNativeMeetingHistory: vi.fn(), router: { replace: vi.fn(), push: vi.fn() } }));

vi.mock("expo-router", () => ({ router: mocks.router }));
vi.mock("../components/Brand", () => ({ Brand: () => null }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: () => null }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../lib/meetingService", () => ({ getNativeMeetingHistory: mocks.getNativeMeetingHistory }));

import HistoryScreen from "./history";

describe("HistoryScreen empty state accessibility", () => {
  beforeEach(() => { mocks.getNativeMeetingHistory.mockReset(); mocks.router.push.mockReset(); mocks.router.replace.mockReset(); });

  it("announces loading while the protected history request is pending", () => {
    mocks.getNativeMeetingHistory.mockImplementation(() => new Promise(() => undefined));
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<HistoryScreen />); });
    const loadingState = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLabel === "جارٍ تحميل سجل الجلسات");
    expect(loadingState.props.accessibilityLiveRegion).toBe("polite");
  });

  it("announces the empty-history explanation through a polite live region", async () => {
    mocks.getNativeMeetingHistory.mockResolvedValue([]);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<HistoryScreen />); await Promise.resolve(); });
    const emptyState = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLiveRegion === "polite");
    expect(emptyState.props.accessibilityRole).toBe("text");
    expect(emptyState.props.accessibilityLabel).toContain("لا توجد جلسات محفوظة بعد");
    expect(mocks.getNativeMeetingHistory).toHaveBeenCalledOnce();
  });

  it("renders server-backed meeting cards after loading", async () => {
    mocks.getNativeMeetingHistory.mockResolvedValue([{ id: 1, inviteCode: "ABCDEFGH", title: "جلسة اختبار", status: "active", createdAt: "2026-08-25T12:00:00.000Z" }]);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<HistoryScreen />); await Promise.resolve(); });
    const cards = renderer!.root.findAll(node => String(node.type) === "Pressable" && node.props.accessibilityLabel === "فتح جلسة اختبار. نشطة.");
    expect(cards).toHaveLength(1);
    act(() => { cards[0].props.onPress(); });
    expect(mocks.router.push).toHaveBeenCalledWith({ pathname: "/meeting", params: { inviteCode: "ABCDEFGH", title: "جلسة اختبار", share: "0" } });
  });

  it("keeps ended meetings read-only instead of opening an interactive room", async () => {
    mocks.getNativeMeetingHistory.mockResolvedValue([{ id: 2, inviteCode: "HGFEDCBA", title: "جلسة منتهية", status: "ended", createdAt: "2026-08-25T12:00:00.000Z" }]);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<HistoryScreen />); await Promise.resolve(); });
    const endedCard = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLabel === "جلسة منتهية. انتهت. لا يمكن فتح غرفة الاجتماع بعد انتهائها.");
    expect(endedCard.props.accessibilityRole).toBe("text");
    expect(renderer!.root.findAll(node => String(node.type) === "Pressable" && String(node.props.accessibilityLabel).includes("جلسة منتهية"))).toHaveLength(0);
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("announces a recoverable error when the protected history request fails", async () => {
    mocks.getNativeMeetingHistory.mockRejectedValue(new Error("network unavailable"));
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<HistoryScreen />); await Promise.resolve(); });
    const errorState = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLabel === "تعذر تحميل سجل الجلسات. أعد المحاولة.");
    expect(errorState.props.accessibilityLiveRegion).toBe("polite");
  });
});
