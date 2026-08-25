import React from "react";

export const View = (props: Record<string, unknown>) => React.createElement("View", props, props.children as React.ReactNode);
export const Text = (props: Record<string, unknown>) => React.createElement("Text", props, props.children as React.ReactNode);
export const Pressable = (props: Record<string, unknown>) => React.createElement("Pressable", props, props.children as React.ReactNode);
export const StyleSheet = { create: <T,>(styles: T) => styles };
