import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { GhostButton, PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
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

  const languageChoices = (selected: string, onSelect: (value: string) => void) => <View style={styles.choices}>{supportedLanguages.map(item => <Pressable key={item.code} onPress={() => onSelect(item.code)} style={[styles.choice, selected === item.code && styles.selected]}><Text style={[styles.choiceText, selected === item.code && styles.selectedText]}>{item.label}</Text></Pressable>)}</View>;

  return <Screen><ScrollView contentContainerStyle={styles.content}><View style={styles.top}><GhostButton title="العودة" onPress={() => router.back()} /><Text style={styles.eyebrow}>حسابك</Text></View><Text style={styles.title}>الإعدادات الشخصية</Text><Text style={styles.subtitle}>تُحفَظ اختياراتك على هذا الجهاز فقط، ثم تُستخدم في الجلسة التالية دون كشفها لمشاركين آخرين.</Text><View style={styles.card}><Text style={styles.cardTitle}>اللغة والترجمة</Text><Text style={styles.fieldLabel}>لغة حديثي الافتراضية</Text>{languageChoices(speechLanguage, setSpeechLanguage)}<Text style={styles.fieldLabel}>لغة الترجمة المعروضة</Text>{languageChoices(displayLanguage, setDisplayLanguage)}</View><View style={styles.card}><Text style={styles.cardTitle}>الصوت والأجهزة</Text><Text style={styles.note}>يتحكم النظام في جهاز الإدخال. اطلب إذن الميكروفون داخل الاجتماع عند بدء النسخ أو التسجيل.</Text><Text style={styles.fieldLabel}>نمط قراءة الترجمة</Text><View style={styles.choices}>{supportedVoiceProfiles.map(profile => <Pressable key={profile.value} onPress={() => setVoiceName(profile.value)} style={[styles.choice, voiceName === profile.value && styles.selected]}><Text style={[styles.choiceText, voiceName === profile.value && styles.selectedText]}>{profile.label}</Text></Pressable>)}</View><Text style={styles.note}>يختار التطبيق صوتًا متاحًا في جهازك بهذا النمط؛ قد يختلف اسم الصوت الفعلي بين Android وiOS.</Text><Text style={styles.fieldLabel}>سرعة قراءة الترجمة</Text><View style={styles.choices}>{supportedVoiceRates.map(rate => <Pressable key={rate.value} onPress={() => setVoiceRate(rate.value)} style={[styles.choice, voiceRate === rate.value && styles.selected]}><Text style={[styles.choiceText, voiceRate === rate.value && styles.selectedText]}>{rate.label}</Text></Pressable>)}</View></View><View style={styles.card}><Text style={styles.cardTitle}>الخصوصية والموافقات</Text><View style={styles.row}><Text style={styles.rowText}>اسألني دائمًا قبل حفظ محتوى اجتماع جديد</Text><Switch value={storage} onValueChange={setStorage} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View><View style={styles.row}><Text style={styles.rowText}>تذكير قبل الجلسات المجدولة</Text><Switch value={reminders} onValueChange={setReminders} trackColor={{ false: "#CBD5E1", true: colors.indigo }} /></View></View><PrimaryButton title={ready ? "حفظ التغييرات" : "تحميل التفضيلات…"} onPress={() => void save()} /></ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { padding: 20, gap: 16 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: colors.indigo, fontSize: 11, fontWeight: "900" }, title: { color: colors.ink, fontSize: 31, fontWeight: "900", textAlign: "right" }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "right" }, card: { borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 17, gap: 13 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "900", textAlign: "right" }, fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "right", marginTop: 2 }, choices: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }, choice: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }, selected: { borderColor: "#C7D2FE", backgroundColor: colors.lavender }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, selectedText: { color: colors.indigo }, note: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: "right" }, row: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center", paddingVertical: 4 }, rowText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 21, textAlign: "right" } });
