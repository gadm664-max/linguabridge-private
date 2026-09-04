import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { MeetingControlButton } from "./MeetingControlButton";

describe("MeetingControlButton", () => {
  it("announces its label and active state to assistive technology", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MeetingControlButton label="إيقاف الالتقاط" active onPress={() => undefined} />); });
    const button = renderer!.root.find(node => String(node.type) === "Pressable");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("إيقاف الالتقاط");
    expect(button.props.accessibilityState).toEqual({ selected: true });
  });

  it("uses the shared mute meaning for inactive and active microphone controls", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<MeetingControlButton controlKind="microphoneMute" onPress={() => undefined} />); });
    const inactiveButton = renderer!.root.find(node => String(node.type) === "Pressable");
    expect(inactiveButton.props.accessibilityLabel).toBe("كتم الصوت");
    expect(inactiveButton.props.accessibilityState).toEqual({ selected: false });
    act(() => { renderer!.update(<MeetingControlButton controlKind="microphoneMute" active onPress={() => undefined} />); });
    const activeButton = renderer!.root.find(node => String(node.type) === "Pressable");
    expect(activeButton.props.accessibilityLabel).toBe("إلغاء كتم الصوت");
    expect(activeButton.props.accessibilityState).toEqual({ selected: true });
  });
});
