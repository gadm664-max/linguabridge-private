import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { AccessibleChoiceGroup } from "./AccessibleChoiceGroup";

describe("AccessibleChoiceGroup", () => {
  it("renders radio choices and exposes the selected text and numeric values", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<AccessibleChoiceGroup label="سرعة القراءة" value={1} choices={[{ value: 0.8, label: "بطيئة" }, { value: 1, label: "عادية" }]} onChange={() => undefined} />); });
    const group = renderer!.root.find(node => String(node.type) === "View" && node.props.accessibilityRole === "radiogroup");
    const radios = renderer!.root.findAll(node => String(node.type) === "Pressable" && node.props.accessibilityRole === "radio");
    expect(group.props.accessibilityLabel).toBe("سرعة القراءة");
    expect(radios.map(node => node.props.accessibilityState.selected)).toEqual([false, true]);
  });
});
