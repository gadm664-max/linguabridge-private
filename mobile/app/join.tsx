import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Brand } from "../components/Brand";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { getInviteSharingSessionParam, supportedLanguages } from "../lib/specs";
import { getNativeMeetingInvitation, joinNativeMeeting, type MeetingInvitation } from "../lib/meetingService";
import { defaultMobilePreferences, loadMobilePreferences } from "../lib/preferences";
import { getSessionToken, signInWithLinguaBridge } from "../lib/session";
import { colors } from "../lib/theme";
import { normalizeInviteCode } from "../lib/inviteSharing";

function LanguagePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View><Text style={styles.label}>{label}</Text><View style={styles.picker}>{supportedLanguages.map(language => <Pressable key={language.code} onPress={() => onChange(language.code)} style={[styles.choice, value === language.code && styles.selectedChoice]}><Text style={[styles.choiceText, value === language.code && styles.selectedText]}>{language.label}</Text></Pressable>)}</View></View>;
}

export default function JoinScreen() {
  const params = useLocalSearchParams<{ inviteCode?: string }>();
  const [code, setCode] = useState(typeof params.inviteCode === "string" ? normalizeInviteCode(params.inviteCode) : "");
  const [invitation, setInvitation] = useState<MeetingInvitation | null>(null);
  const [speaking, setSpeaking] = useState(defaultMobilePreferences.speechLanguage);
  const [display, setDisplay] = useState(defaultMobilePreferences.displayLanguage);
  const [preferences, setPreferences] = useState(defaultMobilePreferences);
  const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);

  const hydratePreferences = async () => {
    const next = await loadMobilePreferences();
    setPreferences(next);
    setSpeaking(next.speechLanguage);
    setDisplay(next.displayLanguage);
  };

  const lookup = async () => {
    const inviteCode = normalizeInviteCode(code);
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/.test(inviteCode)) { Alert.alert("رمز غير صالح", "أدخل رمز دعوة مكوّنًا من 8 إلى 16 حرفًا أو رقمًا آمنًا."); return; }
    try {
      setChecking(true);
      const meeting = await getNativeMeetingInvitation(inviteCode);
      setCode(inviteCode);
      setInvitation(meeting);
      await hydratePreferences();
    } catch (error) {
      setInvitation(null);
      Alert.alert("رابط الدعوة غير متاح", error instanceof Error ? error.message : "تحقق من الرمز واطلب رابطًا جديدًا من المنظم.");
    } finally { setChecking(false); }
  };

  const join = async () => {
    if (!invitation) { Alert.alert("تحقق من الدعوة أولًا", "أدخل رمز الدعوة ثم اضغط تحقق."); return; }
    if (invitation.storageConsent && !consent) { Alert.alert("موافقة مطلوبة", "تحتاج هذه الجلسة إلى موافقتك الصريحة قبل حفظ أي محتوى."); return; }
    try {
      setJoining(true);
      if (!(await getSessionToken())) await signInWithLinguaBridge();
      const meeting = await joinNativeMeeting({ inviteCode: invitation.inviteCode, speakingLanguage: speaking, displayLanguage: display, voiceName: preferences.voiceName, voiceRate: preferences.voiceRate.toFixed(1), storageConsent: consent });
      router.replace({ pathname: "/meeting", params: { title: meeting.title, speaking, display, inviteCode: meeting.inviteCode, share: getInviteSharingSessionParam(meeting.inviteSharingEnabled) } });
    } catch (error) {
      Alert.alert("تعذر الانضمام", error instanceof Error ? error.message : "تحقق من تسجيل الدخول والاتصال ثم أعد المحاولة.");
    } finally { setJoining(false); }
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="الرئيسية" onPress={() => router.replace("/")} /><Brand /></View><View style={styles.step}><Text style={styles.stepText}>انضمام آمن</Text></View><Text style={styles.title}>انضم إلى اجتماع متعدد اللغات</Text><Text style={styles.body}>الصق رابط الدعوة الكامل أو أدخل الرمز، ثم افحصه قبل اختيار لغتي الحديث والعرض.</Text><View style={styles.card}><Text style={styles.label}>رمز أو رابط الدعوة</Text><View style={styles.codeRow}><TextInput value={code} onChangeText={value => { setCode(value); setInvitation(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="رمز أو https://…/join/…" placeholderTextColor={colors.muted} style={styles.codeInput} textAlign="center" /><GhostButton title={checking ? "جارٍ التحقق…" : "تحقق"} onPress={() => void lookup()} /></View>{invitation ? <View style={styles.invitation}><Text style={styles.invitationBadge}>جلسة متاحة</Text><Text style={styles.invitationTitle}>{invitation.title}</Text><Text style={styles.invitationHint}>{invitation.storageConsent ? "تطلب الجلسة موافقتك قبل حفظ المحتوى." : "لن تطلب الجلسة حفظ المحتوى."}</Text><Text style={styles.invitationHint}>{invitation.inviteSharingEnabled ? "أدوات مشاركة الرابط متاحة حسب سياسة المنظم." : "أدوات مشاركة الرابط مخفية حسب سياسة المنظم؛ لا يؤثر ذلك في صلاحية انضمامك."}</Text><LanguagePicker label="لغة الحديث" value={speaking} onChange={setSpeaking} /><LanguagePicker label="لغة العرض والاستماع" value={display} onChange={setDisplay} />{invitation.storageConsent && <Pressable onPress={() => setConsent(value => !value)} style={[styles.consent, consent && styles.consentSelected]}><View style={[styles.checkbox, consent && styles.checkboxSelected]}>{consent && <Text style={styles.checkboxText}>✓</Text>}</View><View style={styles.consentCopy}><Text style={styles.consentTitle}>أوافق على حفظ النص والترجمة ومحضر الجلسة.</Text><Text style={styles.consentHint}>لن يُحفظ المحتوى إلا عند موافقة جميع المشاركين الحاضرين.</Text></View></Pressable>}<PrimaryButton title={joining ? "جارٍ الانضمام…" : "الانضمام إلى الاجتماع"} onPress={() => void join()} /></View> : <Text style={styles.helper}>لا نتحقق من صلاحية الدعوة إلا بعد طلبك، ولا نعرض أي بيانات اجتماع قبل إدخال رمز أو رابط صالح.</Text>}</View></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 36 }, top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, step: { alignSelf: "flex-end", marginTop: 24, borderRadius: 12, backgroundColor: colors.lavender, paddingHorizontal: 10, paddingVertical: 6 }, stepText: { color: colors.indigo, fontSize: 11, fontWeight: "800" }, title: { color: colors.ink, fontSize: 29, lineHeight: 38, textAlign: "right", fontWeight: "900", marginTop: 14 }, body: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right", marginTop: 9 }, card: { marginTop: 22, gap: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 25, padding: 18 }, label: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "right" }, codeRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: -10 }, codeInput: { flex: 1, height: 47, borderRadius: 13, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, color: colors.ink, fontSize: 15, fontWeight: "800", letterSpacing: 1.4 }, invitation: { gap: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 18 }, invitationBadge: { alignSelf: "flex-end", color: colors.success, backgroundColor: colors.successPale, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "800" }, invitationTitle: { color: colors.ink, fontSize: 19, fontWeight: "900", textAlign: "right" }, invitationHint: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: -10 }, picker: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginTop: 9 }, choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, selectedChoice: { backgroundColor: colors.lavender, borderColor: "#C7D2FE" }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, selectedText: { color: colors.indigo }, consent: { flexDirection: "row", justifyContent: "space-between", gap: 13, backgroundColor: "#F8FAFC", borderRadius: 15, padding: 13 }, consentSelected: { backgroundColor: colors.lavender, borderWidth: 1, borderColor: "#C7D2FE" }, consentCopy: { flex: 1 }, consentTitle: { color: colors.ink, fontSize: 13, lineHeight: 20, fontWeight: "800", textAlign: "right" }, consentHint: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 4, textAlign: "right" }, checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }, checkboxSelected: { borderColor: colors.indigo, backgroundColor: colors.indigo }, checkboxText: { color: "white", fontWeight: "900" }, helper: { color: colors.muted, fontSize: 11, lineHeight: 19, textAlign: "right", marginTop: -4 } });
