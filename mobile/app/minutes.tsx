import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { getNativeMeetingMinutes, type NativeMeetingMinutes } from "../lib/meetingService";
import { colors } from "../lib/theme";

export default function MinutesScreen() {
  const params = useLocalSearchParams<{ inviteCode?: string; title?: string }>();
  const [minutes, setMinutes] = useState<NativeMeetingMinutes | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(params.inviteCode ? "loading" : "ready");

  const loadMinutes = async () => {
    if (!params.inviteCode) return;
    setState("loading");
    try { const result = await getNativeMeetingMinutes(params.inviteCode); setMinutes(result.minutes); setState("ready"); }
    catch { setState("error"); }
  };

  useEffect(() => {
    void loadMinutes();
  }, [params.inviteCode]);

  const content = state === "loading" ? <View accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel="جارٍ تحميل المحضر الموثق" style={styles.empty}><ActivityIndicator color={colors.indigo} /><Text style={styles.emptyText}>جارٍ تحميل المحضر الموثق…</Text></View> : state === "error" ? <View accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel="تعذر تحميل المحضر. تحقق من تسجيل الدخول ثم أعد المحاولة." style={styles.empty}><Text style={styles.emptyTitle}>تعذر تحميل المحضر</Text><Text style={styles.emptyText}>تحقق من تسجيل الدخول ثم أعد المحاولة.</Text><PrimaryButton title="إعادة المحاولة" onPress={() => void loadMinutes()} /></View> : !minutes ? <View accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel="لا يوجد محضر موثق لهذه الجلسة بعد. سيظهر المحضر عند حفظه بموافقة المشاركين." style={styles.empty}><Text style={styles.emptyIcon}>▣</Text><Text style={styles.emptyTitle}>لا يوجد محضر موثق بعد</Text><Text style={styles.emptyText}>عند حفظ محضر جلسة بموافقة المشاركين، سيظهر هنا الأصل والترجمة والنقاط المعتمدة فقط.</Text></View> : <View style={styles.minutes}><View style={styles.card}><Text style={styles.cardTitle}>الملخص التنفيذي</Text><Text style={styles.summary}>{minutes.summary}</Text></View><View style={styles.card}><Text style={styles.cardTitle}>النقاط الرئيسية</Text>{minutes.keyPoints.map((item, index) => <Text key={`${item}-${index}`} style={styles.item}>• {item}</Text>)}</View><View style={styles.card}><Text style={styles.cardTitle}>الإجراءات والمتابعة</Text>{minutes.actionItems.map((item, index) => <Text key={`${item}-${index}`} style={styles.item}>• {item}</Text>)}</View></View>;

  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="العودة" onPress={() => router.back()} /><Text style={styles.badge}>محضر قابل للمراجعة</Text></View><Text style={styles.title}>{params.title ? `محضر: ${params.title}` : "محضر الاجتماع"}</Text><Text style={styles.subtitle}>لا تُعرض هنا إلا بيانات محضر موثقة بعد موافقة المشاركين.</Text>{content}<View style={styles.privacy}><Text style={styles.privacyTitle}>خصوصية المحضر</Text><Text style={styles.privacyText}>لن يرسل التطبيق المحضر أو يخزّنه نهائيًا دون موافقة المشاركين النشطين.</Text></View><PrimaryButton title="عرض سجل الجلسات" onPress={() => router.push("/history")} /><GhostButton title="الإعدادات" onPress={() => router.push("/settings")} /></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 16 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, badge: { color: colors.indigo, fontSize: 11, fontWeight: "900", backgroundColor: colors.lavender, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, title: { color: colors.ink, fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 6 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" }, empty: { marginTop: 14, gap: 10, alignItems: "center", borderRadius: 22, borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", backgroundColor: colors.surface, padding: 24 }, emptyIcon: { color: colors.indigo, fontSize: 28 }, emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" }, emptyText: { color: colors.muted, fontSize: 13, lineHeight: 22, textAlign: "center" }, minutes: { gap: 12 }, card: { borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 16 }, cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", textAlign: "right" }, summary: { color: colors.ink, fontSize: 14, lineHeight: 24, textAlign: "right", marginTop: 10 }, item: { color: colors.ink, fontSize: 13, lineHeight: 22, textAlign: "right", marginTop: 8 }, privacy: { borderRadius: 18, backgroundColor: colors.successPale, padding: 14 }, privacyTitle: { color: colors.success, fontSize: 13, fontWeight: "900", textAlign: "right" }, privacyText: { color: "#166534", fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 5 } });
