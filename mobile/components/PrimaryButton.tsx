import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "../lib/theme";

export function PrimaryButton({ title, onPress, disabled, style }: { title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle }) {
  return <Pressable disabled={disabled} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed, style]}><Text style={styles.text}>{title}</Text></Pressable>;
}

export function GhostButton({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}><Text style={styles.ghostText}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({ button: { height: 52, borderRadius: 16, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center", shadowColor: colors.indigo, shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, text: { color: "white", fontSize: 15, fontWeight: "800" }, disabled: { opacity: 0.5 }, pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 }, ghost: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, backgroundColor: colors.surface }, ghostText: { color: colors.ink, fontSize: 14, fontWeight: "700" } });
