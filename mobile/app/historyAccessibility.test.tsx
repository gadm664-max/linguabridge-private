import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("../components/Brand", () => ({ Brand: () => null }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: () => null }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));

import HistoryScreen from "./history";

describe("HistoryScreen empty state accessibility", () => {
  it("announces the empty-history explanation through a polite live region", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<HistoryScreen />); });
    const emptyState = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLiveRegion === "polite");
    expect(emptyState.props.accessibilityRole).toBe("text");
    expect(emptyState.props.accessibilityLabel).toContain("لا توجد جلسات محفوظة بعد");
  });
});
