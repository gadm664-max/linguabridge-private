import { StyleSheet, Text, View } from "react-native";
import { colors } from "../lib/theme";

export function Brand() {
  return <View style={styles.wrap}><View style={styles.mark}><Text style={styles.wave}>⌁</Text></View><Text style={styles.word}>Lingua<Text style={styles.accent}>Bridge</Text></Text></View>;
}

const styles = StyleSheet.create({ wrap: { flexDirection: "row", alignItems: "center", gap: 8 }, mark: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center" }, wave: { color: "white", fontSize: 23, fontWeight: "800", marginTop: -2 }, word: { color: colors.ink, fontSize: 17, fontWeight: "800", letterSpacing: -0.4 }, accent: { color: colors.indigo } });
