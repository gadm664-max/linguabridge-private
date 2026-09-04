import type { PropsWithChildren } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

export function Screen({ children }: PropsWithChildren) {
  return <View style={styles.background}><SafeAreaView style={styles.safe}>{children}</SafeAreaView></View>;
}

const styles = StyleSheet.create({ background: { flex: 1, backgroundColor: colors.pale }, safe: { flex: 1 } });
