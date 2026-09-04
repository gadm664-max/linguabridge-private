import { StyleSheet, Switch, Text, View } from "react-native";
import { getLobbyInviteGuidance, lobbyReadinessCopy } from "../lib/specs";
import { colors } from "../lib/theme";

export function InviteSharingToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <View style={styles.root} testID="invite-sharing-toggle"><View style={styles.copy}><Text style={styles.title}>{lobbyReadinessCopy.invite.title}</Text><Text style={styles.hint} testID="invite-sharing-guidance">{getLobbyInviteGuidance(enabled)}</Text></View><Switch testID="invite-sharing-switch" value={enabled} onValueChange={onChange} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View>;
}

const styles = StyleSheet.create({ root: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, copy: { flex: 1 }, title: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "right" }, hint: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "right" } });
