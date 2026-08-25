import AppNavigation from "@/components/AppNavigation";
import AudioBars from "@/components/AudioBars";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Check, ChevronLeft, Headphones, LockKeyhole, Mic2, MonitorUp, Play, Settings2, ShieldCheck, UserRoundPlus, Volume2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { supportedLanguages } from "../../../shared/meetingSpecs";

const languageOptions = supportedLanguages;

function LanguageSelect({ value, onValueChange, label, hint }: { value: string; onValueChange: (value: string) => void; label: string; hint: string }) {
  return (
    <div>
      <Label className="text-sm font-bold text-slate-700">{label}</Label>
      <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="mt-3 h-12 rounded-xl border-slate-200 bg-white text-right shadow-sm"><SelectValue /></SelectTrigger>
        <SelectContent>{languageOptions.map(language => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export default function Lobby() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [speakingLanguage, setSpeakingLanguage] = useState("ar");
  const [displayLanguage, setDisplayLanguage] = useState("en");
  const [voice, setVoice] = useState("natural");
  const [rate, setRate] = useState([1]);
  const [micOn, setMicOn] = useState(true);
  const [consent, setConsent] = useState(false);
  const [invite, setInvite] = useState(true);
  const [title, setTitle] = useState("اجتماع جديد متعدد اللغات");
  const audioDevices = useAudioDevices();
  const createMeeting = trpc.meetings.create.useMutation({
    onSuccess: meeting => {
      toast.success("أُنشئت الجلسة ورابط الدعوة جاهز للمشاركة.");
      setLocation(`/meeting/${meeting.inviteCode}`);
    },
    onError: error => toast.error(error.message || "تعذر إنشاء الجلسة. حاول مرة أخرى."),
  });

  const enterMeeting = () => {
    if (!consent) {
      toast.error("يلزم تأكيد موافقتك قبل حفظ محتوى هذه الجلسة.");
      return;
    }
    if (!user) {
      toast.info("سجّل الدخول أولًا لإنشاء جلسة خاصة ومحفوظة في سجلك.");
      startLogin();
      return;
    }
    createMeeting.mutate({
      title,
      storageConsent: consent,
      speakingLanguage,
      displayLanguage,
      voiceName: voice,
      voiceRate: rate[0].toFixed(1),
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_12%,rgba(224,231,255,.82),transparent_25rem),#f8f9fd]">
      <AppNavigation />
      <main className="mx-auto max-w-[1220px] px-4 py-8 sm:px-7 sm:py-11">
        <div className="mb-8 flex items-center justify-between gap-4"><button type="button" onClick={() => setLocation("/")} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-700"><ChevronLeft className="h-4 w-4" />العودة للرئيسية</button><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">الخطوة 1 من 2</span></div>
        <div className="grid gap-8 lg:grid-cols-[.92fr_1.08fr] lg:items-start">
          <section className="order-2 rounded-[28px] border border-white bg-white/75 p-5 shadow-[0_18px_50px_-34px_rgba(43,48,104,.35)] backdrop-blur-sm sm:p-7 lg:order-1">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-wide text-indigo-600">جاهزية الصوت</p><h1 className="mt-1 text-2xl font-bold tracking-[-.045em] text-slate-900">لنضبط تجربتك</h1></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Settings2 className="h-5 w-5" /></span></div>
            <div className="mt-7 space-y-7">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${micOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}><Mic2 className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-800">اختيار الميكروفون</p><p className="mt-0.5 text-xs text-slate-500">يُحدّث المتصفح القائمة تلقائيًا عند توصيل جهاز جديد.</p></div></div><button type="button" onClick={() => setMicOn(v => !v)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${micOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{micOn ? "نشط" : "مكتوم"}</button></div><div className="mt-4 grid gap-2"><Select value={audioDevices.selectedInput} onValueChange={audioDevices.setSelectedInput}><SelectTrigger className="h-10 rounded-xl bg-white text-xs"><SelectValue placeholder="الميكروفون الافتراضي" /></SelectTrigger><SelectContent>{audioDevices.inputs.length ? audioDevices.inputs.map(device => <SelectItem key={device.deviceId} value={device.deviceId}>{device.label}</SelectItem>) : <SelectItem value="default-input">الميكروفون الافتراضي</SelectItem>}</SelectContent></Select><Select value={audioDevices.selectedOutput} onValueChange={audioDevices.setSelectedOutput}><SelectTrigger className="h-10 rounded-xl bg-white text-xs"><SelectValue placeholder="السماعة الافتراضية" /></SelectTrigger><SelectContent>{audioDevices.outputs.length ? audioDevices.outputs.map(device => <SelectItem key={device.deviceId} value={device.deviceId}>{device.label}</SelectItem>) : <SelectItem value="default-output">السماعة الافتراضية</SelectItem>}</SelectContent></Select></div><div className="mt-3 flex items-center gap-3 rounded-xl bg-white px-3 py-2.5"><AudioBars active={audioDevices.isTesting || micOn} color="emerald" /><span className="mr-auto text-xs font-semibold text-slate-500">{audioDevices.isTesting ? "اختبار الإشارة جارٍ…" : "اختبر الميكروفون للتأكد من الإشارة"}</span></div><Button variant="ghost" onClick={async () => { const started = await audioDevices.testMicrophone(); if (started) toast.success("بدأ اختبار الميكروفون. تحدث الآن للتحقق من الإشارة."); else if (audioDevices.error) toast.error(audioDevices.error); }} className="mt-2 h-auto px-1 text-xs font-bold text-indigo-600 hover:bg-transparent hover:text-indigo-800"><Play className="ml-1 h-3.5 w-3.5 fill-current" />اختبار الميكروفون</Button>{audioDevices.error && <p className="mt-1 text-[11px] leading-5 text-rose-600">{audioDevices.error}</p>}</div>
              <div className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Headphones className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-800">قراءة الترجمة</p><p className="mt-0.5 text-xs text-slate-500">يُقرأ النص بعد ترجمته بلغتك المختارة</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Select value={voice} onValueChange={setVoice}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="natural">صوت طبيعي — ندى</SelectItem><SelectItem value="warm">صوت دافئ — سلمى</SelectItem><SelectItem value="clear">صوت واضح — ليلى</SelectItem></SelectContent></Select><Button variant="outline" onClick={() => toast.info("هذا نموذج صوتي؛ سيتم تشغيل الصوت المختار بعد ربط خدمة القراءة الصوتية.")} className="h-11 rounded-xl"><Volume2 className="ml-2 h-4 w-4" />معاينة الصوت</Button></div><div className="mt-5"><div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-600"><span>سرعة الإلقاء</span><span>{rate[0].toFixed(1)}×</span></div><Slider value={rate} min={0.7} max={1.4} step={0.1} onValueChange={setRate} /></div></div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><p className="text-xs leading-6 text-slate-600">لن تبدأ المنصة حفظ النص أو الصوت إلا وفق موافقتك. يمكنك تغيير إذن الحفظ من أدوات الاجتماع في أي وقت.</p></div></div>
            </div>
          </section>

          <section className="order-1 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_22px_54px_-36px_rgba(43,48,104,.35)] sm:p-8 lg:order-2"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold tracking-wide text-indigo-600">جلسة جديدة</p><h2 className="mt-1 text-2xl font-bold tracking-[-.045em] text-slate-900 sm:text-3xl">اختر كيف تريد أن تتحدث وتفهم</h2></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white"><MonitorUp className="h-5 w-5" /></span></div><p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">سيبقى النص الأصلي مرئيًا بجوار ترجمته، وستُعرض لك المحادثة بمحاذاة لغة العرض التي تختارها.</p>
            <div className="mt-6"><Label htmlFor="meeting-title" className="text-sm font-bold text-slate-700">اسم الاجتماع</Label><input id="meeting-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none ring-indigo-200 transition-shadow focus:ring-4" /></div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2"><LanguageSelect label="لغة الحديث" hint="اللغة التي ستتحدث بها داخل الاجتماع." value={speakingLanguage} onValueChange={setSpeakingLanguage} /><LanguageSelect label="لغة العرض والاستماع" hint="اللغة التي تريد قراءة الترجمة وسماعها بها." value={displayLanguage} onValueChange={setDisplayLanguage} /></div>
            <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><UserRoundPlus className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-800">إرسال رابط دعوة</p><p className="mt-0.5 text-xs text-slate-500">يمكنك نسخ الرابط ومشاركته بعد فتح الجلسة.</p></div></div><button type="button" onClick={() => setInvite(v => !v)} className={`relative h-7 w-12 rounded-full transition-colors ${invite ? "bg-indigo-600" : "bg-slate-300"}`} aria-pressed={invite}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${invite ? "right-1" : "right-6"}`} /></button></div></div>
            <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-transparent p-2.5 hover:border-indigo-100 hover:bg-indigo-50/45"><Checkbox checked={consent} onCheckedChange={checked => setConsent(Boolean(checked))} className="mt-0.5" /><span><span className="text-sm font-bold text-slate-700">أوافق على حفظ النص المترجم ومحضر الاجتماع.</span><span className="mt-1 block text-xs leading-5 text-slate-500">لن نحفظ محتوى الجلسة ما لم توافق. تستطيع إلغاء هذا الإذن في أي وقت، وحذف المحضر من السجل.</span></span></label>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center"><Button variant="outline" onClick={() => toast.info("سيتاح الانضمام بالرابط بمجرد إنشاء الجلسة.")} className="h-12 rounded-xl px-5"><LockKeyhole className="ml-2 h-4 w-4" />الانضمام برابط</Button><Button disabled={loading || createMeeting.isPending || title.trim().length < 2} onClick={enterMeeting} className="h-12 flex-1 rounded-xl bg-indigo-600 text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700">{createMeeting.isPending ? "يجري إنشاء الجلسة…" : "إنشاء الاجتماع والدخول"} <ArrowLeft className="mr-2 h-4 w-4" /></Button></div>
            <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-slate-400"><Check className="h-3.5 w-3.5 text-emerald-500" />إعداداتك تُطبّق على الجلسة الحالية فقط.</div>
          </section>
        </div>
      </main>
    </div>
  );
}
