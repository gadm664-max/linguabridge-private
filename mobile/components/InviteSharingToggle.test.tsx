import { act, create } from "react-test-renderer";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { InviteSharingToggle } from "./InviteSharingToggle";
import { getLobbyInviteGuidance } from "../lib/specs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ToggleHarness() {
  const [enabled, setEnabled] = useState(true);
  return <InviteSharingToggle enabled={enabled} onChange={setEnabled} />;
}

describe("InviteSharingToggle", () => {
  it("renders the enabled guidance then updates the visible guidance when the switch is disabled", () => {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<ToggleHarness />); });
    expect(tree!.root.findByProps({ testID: "invite-sharing-guidance" }).props.children).toBe(getLobbyInviteGuidance(true));

    act(() => { tree!.root.findByProps({ testID: "invite-sharing-switch" }).props.onValueChange(false); });
    expect(tree!.root.findByProps({ testID: "invite-sharing-guidance" }).props.children).toBe(getLobbyInviteGuidance(false));
    expect(tree!.root.findByProps({ testID: "invite-sharing-switch" }).props.value).toBe(false);
  });
});
