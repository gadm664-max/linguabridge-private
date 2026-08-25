import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { AccessibleChoiceGroup } from "../components/AccessibleChoiceGroup";
import { defaultMobilePreferences, loadMobilePreferences, saveMobilePreferences } from "../lib/preferences";
import { supportedLanguages, supportedVoiceProfiles, supportedVoiceRates } from "../lib/specs";
import { colors } from "../lib/theme";

export default function SettingsScreen() {
  const [speechLanguage, setSpeechLanguage] = useState(defaultMobilePreferences.speechLanguage);
  const [displayLanguage, setDisplayLanguage] = useState(defaultMobilePreferences.displayLanguage);
  const [voiceName, setVoiceName] = useState(defaultMobilePreferences.voiceName);
  const [voiceRate, setVoiceRate] = useState(defaultMobilePreferences.voiceRate);
  const [storage, setStorage] = useState(defaultMobilePreferences.askBeforeStorage);
  const [reminders, setReminders] = useState(defaultMobilePreferences.meetingReminders);
  const [ready, setReady] = useState(false);

  useEffect(() => { void loadMobilePreferences().then(preferences => { setSpeechLanguage(preferences.speechLanguage); setDisplayLanguage(preferences.displayLanguage); setVoiceName(preferences.voiceName); setVoiceRate(preferences.voiceRate); setStorage(preferences.askBeforeStorage); setReminders(preferences.meetingReminders); setReady(true); }); }, []);

  const save = async () => {
    try {
      await saveMobilePreferences({ speechLanguage, displayLanguage, voiceName, voiceRate, askBeforeStorage: storage, meetingReminders: reminders });
      Alert.alert("حُفظ محليًا", "ستستخدم الجلسة التالية لغاتك وسرعة القراءة التي اخترتها.");
    } catch {
      Alert.alert("تعذر الحفظ", "تحقق من مساحة التخزين المحمية على الجهاز ثم حاول مجددًا.");
    }
  };

  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="العودة" onPress={() => router.back()} /><Text style={styles.eyebrow}>حسابك</Text></View><Text style={styles.title}>الإعدادات الشخصية</Text><Text style={styles.subtitle}>تُحفَظ اختياراتك على هذا الجهاز فقط، ثم تُستخدم في الجلسة التالية دون كشفها لمشاركين آخرين.</Text><View style={styles.card}><Text style={styles.cardTitle}>اللغة والترجمة</Text><AccessibleChoiceGroup label="لغة حديثي الافتراضية" value={speechLanguage} choices={supportedLanguages.map(item => ({ value: item.code, label: item.label }))} onChange={value => setSpeechLanguage(String(value))} /><AccessibleChoiceGroup label="لغة الترجمة المعروضة" value={displayLanguage} choices={supportedLanguages.map(item => ({ value: item.code, label: item.label }))} onChange={value => setDisplayLanguage(String(value))} /></View><View style={styles.card}><Text style={styles.cardTitle}>الصوت والأجهزة</Text><Text style={styles.note}>يتحكم النظام في جهاز الإدخال. اطلب إذن الميكروفون داخل الاجتماع عند بدء النسخ أو التسجيل.</Text><AccessibleChoiceGroup label="نمط قراءة الترجمة" value={voiceName} choices={supportedVoiceProfiles} onChange={value => setVoiceName(String(value))} /><Text style={styles.note}>يختار التطبيق صوتًا متاحًا في جهازك بهذا النمط؛ قد يختلف اسم الصوت الفعلي بين Android وiOS.</Text><AccessibleChoiceGroup label="سرعة قراءة الترجمة" value={voiceRate} choices={supportedVoiceRates} onChange={value => setVoiceRate(Number(value))} /></View><View style={styles.card}><Text style={styles.cardTitle}>الخصوصية والموافقات</Text><View style={styles.row}><Text style={styles.rowText}>اسألني دائمًا قبل حفظ محتوى اجتماع جديد</Text><Switch value={storage} onValueChange={setStorage} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View><View style={styles.row}><Text style={styles.rowText}>تذكير قبل الجلسات المجدولة</Text><Switch value={reminders} onValueChange={setReminders} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View></View><PrimaryButton title={ready ? "حفظ التغييرات" : "تحميل التفضيلات…"} onPress={() => void save()} /></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 16 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: colors.indigo, fontSize: 11, fontWeight: "900" }, title: { color: colors.ink, fontSize: 31, fontWeight: "900", textAlign: "right" }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" }, card: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 17, gap: 13 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", textAlign: "right" }, note: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: "right" }, row: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center", paddingVertical: 4 }, rowText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 21, textAlign: "right" } });
