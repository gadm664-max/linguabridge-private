import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../lib/theme";
import { getMicrophoneMuteControlCopy } from "../lib/specs";

export function MeetingControlButton({ label, active = false, controlKind, onPress }: { label?: string; active?: boolean; controlKind?: "microphoneMute"; onPress: () => void }) {
  const resolvedLabel = controlKind === "microphoneMute" ? getMicrophoneMuteControlCopy(active).label : label ?? "";
  return <Pressable accessibilityRole="button" accessibilityLabel={resolvedLabel} accessibilityState={{ selected: active }} onPress={onPress} style={[styles.control, active && styles.activeControl]}><Text style={styles.controlText}>{resolvedLabel}</Text></Pressable>;
}

const styles = StyleSheet.create({ control: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 11 }, activeControl: { borderColor: "#C7D2FE", backgroundColor: colors.lavender }, controlText: { color: colors.ink, fontSize: 11, fontWeight: "800" } });
