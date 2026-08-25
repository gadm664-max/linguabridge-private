import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { LanguageChoiceGroup } from "./LanguageChoiceGroup";
import { isSelectedLanguage } from "./languageChoice";

describe("isSelectedLanguage", () => {
  it("identifies only the active language choice", () => {
    expect(isSelectedLanguage("ar", "ar")).toBe(true);
    expect(isSelectedLanguage("ar", "en")).toBe(false);
  });

  it("renders accessible radio choices and marks only the active language", () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<LanguageChoiceGroup label="اللغة" value="ar" choices={[{ code: "ar", label: "العربية" }, { code: "en", label: "English" }]} onChange={() => undefined} />); });
    const radios = renderer!.root.findAll(node => String(node.type) === "Pressable" && node.props.accessibilityRole === "radio");
    expect(radios).toHaveLength(2);
    expect(radios.map(node => node.props.accessibilityState.selected)).toEqual([true, false]);
  });
});
