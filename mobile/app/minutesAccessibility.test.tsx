import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({ router: { back: vi.fn(), push: vi.fn() } }));
vi.mock("../components/PrimaryButton", () => ({ GhostButton: () => null, PrimaryButton: () => null }));
vi.mock("../components/Screen", () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));

import MinutesScreen from "./minutes";

describe("MinutesScreen transparent empty state", () => {
  it("announces that no approved minutes are available and avoids demo meeting content", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MinutesScreen />); });
    const emptyState = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityLiveRegion === "polite");
    expect(emptyState.props.accessibilityLabel).toContain("لا يوجد محضر موثق");
    const renderedText = renderer!.root.findAll(node => String(node.type) === "Text").flatMap(node => node.children).join("");
    expect(renderedText).not.toContain("نطاق الإطلاق");
  });
});
