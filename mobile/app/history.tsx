import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Brand } from "../components/Brand";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { colors } from "../lib/theme";

export default function HistoryScreen() {
  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="الرئيسية" onPress={() => router.replace("/")} /><Brand /></View><Text style={styles.eyebrow}>مساحتك الخاصة</Text><Text style={styles.title}>سجل الجلسات</Text><Text style={styles.subtitle}>ستظهر هنا الجلسات التي تنشئها من حسابك، مع محاضرها المحفوظة بعد موافقة المشاركين.</Text><View style={styles.empty}><Text style={styles.sparkle}>✦</Text><Text style={styles.emptyTitle}>لا توجد جلسات محفوظة بعد</Text><Text style={styles.emptyText}>أنشئ اجتماعًا جديدًا لتبدأ سجلًا منظّمًا لمحاضرك وإجراءات المتابعة.</Text><PrimaryButton title="بدء اجتماع جديد" onPress={() => router.push("/lobby")} /></View></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 15 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: colors.indigo, fontSize: 11, fontWeight: "900", textAlign: "right", marginTop: 20 }, title: { color: colors.ink, fontSize: 32, fontWeight: "900", textAlign: "right" }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" }, empty: { marginTop: 20, gap: 10, alignItems: "center", borderRadius: 24, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", backgroundColor: colors.surface, padding: 26 }, sparkle: { color: colors.indigo, fontSize: 28 }, emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" }, emptyText: { color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: "center", marginBottom: 7 } });
