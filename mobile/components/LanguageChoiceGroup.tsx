import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";
import { isSelectedLanguage } from "./languageChoice";

export type LanguageChoice = { code: string; label: string };

export function LanguageChoiceGroup({ label, value, choices, onChange }: { label: string; value: string; choices: readonly LanguageChoice[]; onChange: (value: string) => void }) {
  return <View><Text style={styles.label}>{label}</Text><View accessibilityRole="radiogroup" style={styles.picker}>{choices.map(language => <Pressable key={language.code} accessibilityRole="radio" accessibilityState={{ selected: isSelectedLanguage(value, language.code) }} onPress={() => onChange(language.code)} style={[styles.choice, isSelectedLanguage(value, language.code) && styles.selectedChoice]}><Text style={[styles.choiceText, isSelectedLanguage(value, language.code) && styles.selectedText]}>{language.label}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({ label: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "right" }, picker: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginTop: 9 }, choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, selectedChoice: { backgroundColor: colors.lavender, borderColor: "#C7D2FE" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, selectedText: { color: colors.indigo } });
