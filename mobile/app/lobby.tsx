import { router } from "expo-router";
import { AudioModule, setAudioModeAsync } from "expo-audio";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Brand } from "../components/Brand";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { meetingPrivacyDefaults, supportedLanguages } from "../lib/specs";
import { colors } from "../lib/theme";
import { createNativeMeeting } from "../lib/meetingService";
import { getSessionToken, signInWithLinguaBridge } from "../lib/session";
import { defaultMobilePreferences, loadMobilePreferences } from "../lib/preferences";

function LanguagePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <View><Text style={styles.label}>{label}</Text><View style={styles.picker}>{supportedLanguages.map(language => <Pressable key={language.code} onPress={() => onChange(language.code)} style={[styles.choice, value === language.code && styles.selectedChoice]}><Text style={[styles.choiceText, value === language.code && styles.selectedText]}>{language.label}</Text></Pressable>)}</View></View>; }

export default function LobbyScreen() {
  const [title, setTitle] = useState("اجتماع جديد متعدد اللغات"); const [speaking, setSpeaking] = useState(defaultMobilePreferences.speechLanguage); const [display, setDisplay] = useState(defaultMobilePreferences.displayLanguage); const [preferences, setPreferences] = useState(defaultMobilePreferences); const [consent, setConsent] = useState(false); const [tested, setTested] = useState(false); const [creating, setCreating] = useState(false);
  useEffect(() => { void loadMobilePreferences().then(next => { setPreferences(next); setSpeaking(next.speechLanguage); setDisplay(next.displayLanguage); }); }, []);
  const start = async () => {
    if (meetingPrivacyDefaults.requiresExplicitConsent && !consent) { Alert.alert("موافقة مطلوبة", "أكّد موافقتك قبل تفعيل حفظ النص والمحضر."); return; }
    try {
      setCreating(true);
      if (!(await getSessionToken())) await signInWithLinguaBridge();
      const meeting = await createNativeMeeting({ title, speakingLanguage: speaking, displayLanguage: display, storageConsent: consent, voiceName: preferences.voiceName, voiceRate: preferences.voiceRate.toFixed(1) });
      router.push({ pathname: "/meeting", params: { title: meeting.title, speaking, display, inviteCode: meeting.inviteCode } });
    } catch (error) {
      Alert.alert("تعذر إنشاء الاجتماع", error instanceof Error ? error.message : "تحقق من إعداد الخدمة وتسجيل الدخول ثم أعد المحاولة.");
    } finally { setCreating(false); }
  };
  const testMicrophone = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { Alert.alert("تعذر الوصول", "يحتاج LinguaBridge إلى صلاحية الميكروفون لاختبار الصوت والنسخ الحي."); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      setTested(true);
      Alert.alert("الميكروفون جاهز", "تم منح الصلاحية وتهيئة جلسة الصوت. يمكنك بدء النسخ الحي داخل الاجتماع.");
    } catch { Alert.alert("تعذر الاختبار", "تأكد من إعدادات الميكروفون في الجهاز ثم حاول مرة أخرى."); }
  };
  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="الرئيسية" onPress={() => router.back()} /><Brand /></View><View style={styles.step}><Text style={styles.stepText}>الخطوة 1 من 2</Text></View><Text style={styles.title}>اختر كيف تريد أن تتحدث وتفهم</Text><Text style={styles.body}>يظل النص الأصلي بجوار ترجمته، ويمكنك تعديل إعداداتك قبل الانضمام.</Text><View style={styles.card}><Text style={styles.label}>اسم الاجتماع</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} textAlign="right" maxLength={160} /><LanguagePicker label="لغة الحديث" value={speaking} onChange={setSpeaking} /><LanguagePicker label="لغة العرض والاستماع" value={display} onChange={setDisplay} /><View style={styles.divider} /><View style={styles.audio}><View><Text style={styles.audioTitle}>جاهزية الصوت</Text><Text style={styles.audioHint}>{tested ? "تم اختبار الميكروفون بنجاح" : "اختبر الميكروفون قبل الدخول"}</Text></View><View style={[styles.status, tested && styles.statusOk]}><Text style={styles.statusText}>{tested ? "جاهز" : "غير مختبر"}</Text></View></View><GhostButton title="اختبار الميكروفون" onPress={() => void testMicrophone()} /><View style={styles.consent}><View style={styles.consentCopy}><Text style={styles.consentTitle}>أوافق على حفظ النص المترجم ومحضر الاجتماع</Text><Text style={styles.consentHint}>{meetingPrivacyDefaults.requiresAllActiveParticipants ? "لن يُحفظ المحتوى إلا عند موافقتك وموافقة جميع المشاركين الحاضرين." : "لن يُحفظ المحتوى ما لم توافق أنت والمشاركون الحاضرون."}</Text></View><Switch value={consent} onValueChange={setConsent} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View><PrimaryButton title={creating ? "جارٍ إنشاء الاجتماع…" : "إنشاء الاجتماع والدخول"} onPress={() => void start()} /></View></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 36 }, top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, step: { alignSelf: "flex-end", marginTop: 24, borderRadius: 12, backgroundColor: colors.lavender, paddingHorizontal: 10, paddingVertical: 6 }, stepText: { color: colors.indigo, fontSize: 11, fontWeight: "800" }, title: { color: colors.ink, fontSize: 29, lineHeight: 38, textAlign: "right", fontWeight: "900", marginTop: 14 }, body: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right", marginTop: 9 }, card: { marginTop: 22, gap: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 25, padding: 18 }, label: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "right" }, input: { height: 47, borderRadius: 13, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, color: colors.ink, fontSize: 14, marginTop: -10 }, picker: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginTop: 9 }, choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, selectedChoice: { backgroundColor: colors.lavender, borderColor: "#C7D2FE" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, selectedText: { color: colors.indigo }, divider: { height: 1, backgroundColor: colors.line }, audio: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, audioTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "right" }, audioHint: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "right" }, status: { borderRadius: 999, backgroundColor: "#F1F5F9", paddingHorizontal: 9, paddingVertical: 5 }, statusOk: { backgroundColor: colors.successPale }, statusText: { color: colors.success, fontSize: 10, fontWeight: "800" }, consent: { flexDirection: "row", justifyContent: "space-between", gap: 13, backgroundColor: "#F8FAFC", borderRadius: 15, padding: 13 }, consentCopy: { flex: 1 }, consentTitle: { color: colors.ink, fontSize: 13, lineHeight: 20, fontWeight: "800", textAlign: "right" }, consentHint: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 4, textAlign: "right" } });
