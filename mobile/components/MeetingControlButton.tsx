import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";

export function MeetingControlButton({ label, active = false, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.control, active && styles.activeControl]}><Text style={styles.controlText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({ control: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 11 }, activeControl: { borderColor: "#C7D2FE", backgroundColor: colors.lavender }, controlText: { color: colors.ink, fontSize: 11, fontWeight: "800" } });
