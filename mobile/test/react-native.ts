import { createElement } from "react";

type HostProps = Record<string, unknown> & { children?: unknown };

function hostComponent(type: string) {
  return function HostComponent({ children, ...props }: HostProps) {
    return createElement(type, props, children as never);
  };
}

export const View = hostComponent("View");
export const Text = hostComponent("Text");
export const Switch = hostComponent("Switch");
export const StyleSheet = { create: <T,>(styles: T) => styles };
