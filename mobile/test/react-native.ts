import React from "react";

export const View = (props: Record<string, unknown>) => React.createElement("View", props, props.children as React.ReactNode);
export const Text = (props: Record<string, unknown>) => React.createElement("Text", props, props.children as React.ReactNode);
export const Pressable = (props: Record<string, unknown>) => React.createElement("Pressable", props, props.children as React.ReactNode);
export const ScrollView = (props: Record<string, unknown>) => React.createElement("ScrollView", props, props.children as React.ReactNode);
export const Switch = (props: Record<string, unknown>) => React.createElement("Switch", props, props.children as React.ReactNode);
export const TextInput = (props: Record<string, unknown>) => React.createElement("TextInput", props, props.children as React.ReactNode);
export const StyleSheet = { create: <T,>(styles: T) => styles };
