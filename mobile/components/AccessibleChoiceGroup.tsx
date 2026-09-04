import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export type AccessibleChoice = { value: string | number; label: string };

export function AccessibleChoiceGroup({ label, value, choices, onChange }: { label: string; value: string | number; choices: readonly AccessibleChoice[]; onChange: (value: string | number) => void }) {
  return <View accessibilityLabel={label} accessibilityRole="radiogroup"><Text style={styles.label}>{label}</Text><View style={styles.picker}>{choices.map(choice => <Pressable key={String(choice.value)} accessibilityRole="radio" accessibilityState={{ selected: value === choice.value }} onPress={() => onChange(choice.value)} style={[styles.choice, value === choice.value && styles.selectedChoice]}><Text style={[styles.choiceText, value === choice.value && styles.selectedText]}>{choice.label}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({ label: { color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 2 }, picker: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 9 }, choice: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }, selectedChoice: { borderColor: "#C7D2FE", backgroundColor: colors.lavender }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, selectedText: { color: colors.indigo } });
