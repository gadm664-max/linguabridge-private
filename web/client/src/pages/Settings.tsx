import AppNavigation from "@/components/AppNavigation";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { supportedLanguages, supportedVoiceRates } from "../../../shared/meetingSpecs";
import { BadgeCheck, BellRing, Database, Download, Globe2, LockKeyhole, LogIn, MessageCircleMore, Save, ShieldCheck, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const LanguageOptions = () => <SelectContent>{supportedLanguages.map(language => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>;

export default function Settings() {
  const { user, loading } = useAuth();
  const preferences = trpc.meetings.preferences.get.useQuery(undefined, { enabled: Boolean(user) });
  const savePreferences = trpc.meetings.preferences.save.useMutation({ onSuccess: () => toast.success("حُفظت إعداداتك في حسابك."), onError: error => toast.error(error.message || "تعذر حفظ الإعدادات.") });
  const whatsapp = trpc.whatsapp.status.useQuery(undefined, { enabled: Boolean(user) });
  const isAdmin = user?.role === "admin";
  const whatsappAdmin = trpc.whatsapp.adminStatus.useQuery(undefined, { enabled: isAdmin });
  const dataExport = trpc.meetings.dataExport.useQuery(undefined, { enabled: false });
  const [speakingLanguage, setSpeakingLanguage] = useState("ar");
  const [displayLanguage, setDisplayLanguage] = useState("en");
  const [voiceName, setVoiceName] = useState("natural");
  const [voiceRate, setVoiceRate] = useState("1.0");
  const [confirmStorage, setConfirmStorage] = useState(true);
  const [reminders, setReminders] = useState(true);

  useEffect(() => {
    if (!preferences.data) return;
    setSpeakingLanguage(preferences.data.speakingLanguage);
    setDisplayLanguage(preferences.data.displayLanguage);
    setVoiceName(preferences.data.voiceName);
    setVoiceRate(preferences.data.voiceRate);
    setConfirmStorage(preferences.data.confirmStoragePerMeeting);
    setReminders(preferences.data.meetingReminders);
  }, [preferences.data]);

  const save = () => {
    if (!user) { startLogin(); return; }
    savePreferences.mutate({ speakingLanguage, displayLanguage, voiceName, voiceRate, confirmStoragePerMeeting: confirmStorage, meetingReminders: reminders });
  };

  const downloadDataExport = async () => {
    if (!user) { startLogin(); return; }
    try {
      const exportData = await dataExport.refetch();
      if (!exportData.data) throw new Error("لم يُنشأ ملف التصدير.");
      const blob = new Blob([JSON.stringify(exportData.data, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `linguabridge-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(href);
      toast.success("تم تنزيل نسخة بيانات حسابك.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز ملف البيانات.");
    }
  };

  if (!loading && !user) return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto grid max-w-xl place-items-center px-4 py-28"><div className="rounded-[24px] border border-indigo-100 bg-white p-8 text-center shadow-sm"><LogIn className="mx-auto h-7 w-7 text-indigo-600" /><h1 className="mt-4 text-xl font-bold text-slate-900">سجّل الدخول لحفظ تفضيلاتك</h1><p className="mt-2 text-sm text-slate-500">ستُستخدم تفضيلاتك عند إنشاء جلسة جديدة أو الانضمام إليها.</p><Button onClick={startLogin} className="mt-5 rounded-xl bg-indigo-600">تسجيل الدخول</Button></div></main></div>;

  const assistantReady = whatsapp.data?.assistantReady ?? false;
  return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto max-w-[920px] px-4 py-8 sm:px-7 sm:py-11">
    <p className="text-xs font-bold text-indigo-600">حسابك</p>
    <h1 className="mt-2 font-display text-3xl font-bold tracking-[-.055em] text-slate-950 sm:text-4xl">الإعدادات الشخصية</h1>
    <p className="mt-3 text-sm leading-6 text-slate-500">اضبط لغتك الافتراضية، صوت القراءة، وطريقة التعامل مع محتوى جلساتك.</p>

    <div className="mt-8 space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6"><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><Globe2 className="h-5 w-5 text-indigo-600" />اللغة والترجمة</span><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><Label>لغة الحديث الافتراضية</Label><Select value={speakingLanguage} onValueChange={setSpeakingLanguage}><SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue /></SelectTrigger><LanguageOptions /></Select></div><div><Label>لغة العرض الافتراضية</Label><Select value={displayLanguage} onValueChange={setDisplayLanguage}><SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue /></SelectTrigger><LanguageOptions /></Select></div></div></section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6"><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><Volume2 className="h-5 w-5 text-indigo-600" />الصوت والأجهزة</span><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><Label>صوت قراءة الترجمة</Label><Select value={voiceName} onValueChange={setVoiceName}><SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="natural">ندى — طبيعي</SelectItem><SelectItem value="warm">سلمى — دافئ</SelectItem></SelectContent></Select></div><div><Label>سرعة القراءة</Label><Select value={voiceRate} onValueChange={setVoiceRate}><SelectTrigger className="mt-2 h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{supportedVoiceRates.map(rate => <SelectItem key={rate.value} value={rate.value.toFixed(1)}>{rate.label}</SelectItem>)}</SelectContent></Select></div></div></section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6"><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-emerald-600" />الخصوصية والموافقات</span><label className="mt-5 flex cursor-pointer items-start gap-3"><Checkbox checked={confirmStorage} onCheckedChange={value => setConfirmStorage(Boolean(value))} className="mt-0.5" /><span><b className="text-sm text-slate-700">اسألني دائمًا قبل حفظ محتوى اجتماع جديد</b><span className="mt-1 block text-xs leading-5 text-slate-500">لا يُحفظ النص أو المحضر دون موافقتك الصريحة في الردهة.</span></span></label><div className="mt-4 flex gap-3 rounded-xl bg-emerald-50 p-3 text-xs leading-6 text-emerald-800"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />يمكنك طلب حذف المحاضر المحفوظة من سجل الجلسات وفق سياسة الخصوصية.</div></section>

      <section className="rounded-[24px] border border-sky-100 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><Database className="h-5 w-5 text-sky-600" />شفافية بياناتك</span><p className="mt-2 text-sm leading-6 text-slate-500">لا يجمع LinguaBridge بياناتك سرًا، ولا يبيع بيانات الحساب أو محتوى الاجتماعات أو رقم هاتفك. نحتفظ فقط بما يلزم لتشغيل الحساب والجلسة وفق اختياراتك.</p></div><Button type="button" variant="outline" disabled={dataExport.isFetching} onClick={() => void downloadDataExport()} className="h-9 rounded-xl border-sky-200 text-xs text-sky-800 hover:bg-sky-50"><Download className="ml-1.5 h-4 w-4" />{dataExport.isFetching ? "يجري التجهيز…" : "تنزيل بياناتي"}</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3.5"><b className="text-xs text-slate-800">الحساب والتفضيلات</b><p className="mt-1.5 text-[11px] leading-5 text-slate-500">معرّف الدخول واللغات والصوت لإظهار تجربتك وحفظها في حسابك.</p></div><div className="rounded-2xl bg-indigo-50 p-3.5"><b className="text-xs text-indigo-900">نص الاجتماع والمحضر</b><p className="mt-1.5 text-[11px] leading-5 text-indigo-700">لا يُحفظان إلا بعد تحقق موافقات الاجتماع. يمكنك مراجعة السجل وطلب الحذف.</p></div><div className="rounded-2xl bg-emerald-50 p-3.5"><b className="text-xs text-emerald-900">التحسين</b><p className="mt-1.5 text-[11px] leading-5 text-emerald-700">أي قياس مستقبلي يكون مجمعًا وغير معرّف للهوية بعد إشعار واضح، بلا صوت خام أو رسائل.</p></div></div><div className="mt-4 rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-3 text-xs leading-6 text-sky-900"><b>حقوقك:</b> زر التنزيل يُخرج بيانات حسابك وتفضيلاتك وسجل مشاركتك فقط، ولا يُخرج بيانات مشاركين آخرين أو رسائلهم أو التسجيلات أو النصوص المشتركة. يمكنك أيضًا رفض التخزين غير الضروري ومراجعة المحاضر من سجل الجلسات.</div></section>

      <section className="rounded-[24px] border border-emerald-100 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><MessageCircleMore className="h-5 w-5 text-emerald-600" />WhatsApp Business</span><p className="mt-2 text-sm leading-6 text-slate-500">{whatsapp.data?.message ?? "يجري التحقق من حالة المساعد."}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${assistantReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-700"}`}>{assistantReady ? "المساعد جاهز" : "المشاركة متاحة"}</span></div><div className="mt-4 rounded-xl bg-emerald-50 p-4 text-xs leading-6 text-emerald-900"><b>خصوصيتك محفوظة.</b> رقم واتساب هو رقم أعمال مملوك للمشروع، لا رقمك الشخصي. يمكنك مراسلته أو استقبال روابط الدعوات والمحاضر، لكنك لا تملك وصولًا إلى حساب المالك أو محادثات أي مستخدم آخر. لا تُعالج رسالة نصية أو صوتية إلا بعد إرسال موافقتك الصريحة في المحادثة.</div>{isAdmin && <div className="mt-4 rounded-xl border border-dashed border-emerald-200 p-4 text-xs leading-6 text-slate-600"><b className="text-slate-800">إدارة المالك:</b> {whatsappAdmin.data?.assistantReady ? "الربط مهيأ ويقتصر الوصول إلى مفاتيحه على الخادم." : "اربط رقم WhatsApp Business من حساب Meta الخاص بك لاحقًا؛ لا تظهر مفاتيح الوصول لأي مستخدم."}<span className="mt-1 block text-slate-400">مسار الويب هوك: {whatsappAdmin.data?.webhookPath ?? "/api/whatsapp/webhook"}</span></div>}</section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6"><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><BellRing className="h-5 w-5 text-indigo-600" />التنبيهات</span><label className="mt-5 flex cursor-pointer items-center gap-3"><Checkbox checked={reminders} onCheckedChange={value => setReminders(Boolean(value))} /><b className="text-sm text-slate-700">أرسل تذكيرًا قبل الجلسات المجدولة</b></label></section>
    </div>
    <div className="mt-7 flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs text-slate-400"><BadgeCheck className="h-4 w-4 text-emerald-500" />تُحفظ هذه التفضيلات في حسابك.</span><Button disabled={savePreferences.isPending} onClick={save} className="rounded-xl bg-indigo-600"><Save className="ml-2 h-4 w-4" />{savePreferences.isPending ? "يجري الحفظ…" : "حفظ التغييرات"}</Button></div>
  </main></div>;
}
