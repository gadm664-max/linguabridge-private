import AudioBars from "@/components/AudioBars";
import LinguaBrand from "@/components/LinguaBrand";
import MeetingAudioSettings from "@/components/MeetingAudioSettings";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLiveSpeech } from "@/hooks/useLiveSpeech";
import { trpc } from "@/lib/trpc";
import { buildMeetingInviteShare } from "@/lib/whatsapp";
import { Captions, ChevronLeft, CircleStop, FileText, Headphones, Languages, LockKeyhole, MessageSquareText, Mic, MicOff, Pause, Play, Plus, Send, Settings2, Share2, Sparkles, UsersRound, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { getLiveTranscriptionStatus, getMicrophoneMuteControlCopy } from "@shared/meetingSpecs";

type TranscriptItem = { id: number; speaker: string; initials: string; origin: string; translation: string; time: string; language: string; tone: string };
type ChatItem = { id: number; sender: string; origin: string; translation: string; mine?: boolean; time: string };

const initialTranscript: TranscriptItem[] = [
  { id: 1, speaker: "مايا حداد", initials: "م", origin: "أقترح أن نبدأ بنطاق الإطلاق، ثم نراجع المراحل مع الفريق.", translation: "I suggest we start with the launch scope, then review the milestones with the team.", time: "10:14", language: "العربية", tone: "bg-amber-100 text-amber-800" },
  { id: 2, speaker: "Daniel Brooks", initials: "DB", origin: "That works for me. I need clarity on the pilot markets before we lock the timeline.", translation: "هذا مناسب لي. أحتاج إلى وضوح بشأن أسواق التجربة قبل أن نثبت الجدول الزمني.", time: "10:15", language: "English", tone: "bg-indigo-100 text-indigo-800" },
  { id: 3, speaker: "سارة ناصر", initials: "س", origin: "سأرسل ملخصًا للمخاطر التي قد تؤثر على الإطلاق بعد الاجتماع.", translation: "I will send a summary of risks that could affect the launch after the meeting.", time: "10:16", language: "العربية", tone: "bg-emerald-100 text-emerald-800" },
];

const demoSegments: Omit<TranscriptItem, "id">[] = [
  { speaker: "مايا حداد", initials: "م", origin: "من المهم أن نحتفظ بتجربة بسيطة للمستخدمين الجدد خلال الإطلاق الأول.", translation: "It is important that we keep the experience simple for new users during the first launch.", time: "الآن", language: "العربية", tone: "bg-amber-100 text-amber-800" },
  { speaker: "Daniel Brooks", initials: "DB", origin: "Agreed. I can prepare the onboarding copy and a short help center flow.", translation: "متفق. يمكنني إعداد نصوص التهيئة وتدفق مختصر لمركز المساعدة.", time: "الآن", language: "English", tone: "bg-indigo-100 text-indigo-800" },
];

const participants = [
  { name: "مايا حداد", initials: "م", speech: "العربية", display: "English", tone: "bg-amber-100 text-amber-800" },
  { name: "Daniel Brooks", initials: "DB", speech: "English", display: "العربية", tone: "bg-indigo-100 text-indigo-800" },
  { name: "سارة ناصر", initials: "س", speech: "العربية", display: "Français", tone: "bg-emerald-100 text-emerald-800" },
];

const languageLabels: Record<string, string> = { ar: "العربية", en: "English", fr: "Français" };
const speechLocales: Record<string, string> = { ar: "ar-SA", en: "en-US", fr: "fr-FR" };

function AvatarMark({ initials, tone, active = false }: { initials: string; tone: string; active?: boolean }) {
  return <div className="relative"><Avatar className={`h-9 w-9 border-2 border-white ${tone}`}><AvatarFallback className="bg-transparent text-[11px] font-bold">{initials}</AvatarFallback></Avatar>{active && <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}</div>;
}

function ControlButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={`grid h-10 w-10 place-items-center rounded-xl border transition-colors ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

export default function Meeting() {
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/meeting/:sessionId");
  const inviteCode = params?.sessionId?.toUpperCase() ?? "";
  const requestedInviteSharingEnabled = new URLSearchParams(location.split("?")[1] ?? "").get("share") !== "0";
  const validInviteCode = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/.test(inviteCode);
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [activePanel, setActivePanel] = useState("transcript");
  const [transcript, setTranscript] = useState(initialTranscript);
  const [chat, setChat] = useState<ChatItem[]>([{ id: 1, sender: "Daniel Brooks", origin: "Could we capture the decision about the pilot markets?", translation: "هل يمكننا توثيق القرار الخاص بأسواق التجربة؟", time: "10:16" }]);
  const [draft, setDraft] = useState("");
  const [translationOn, setTranslationOn] = useState(true);
  const [voiceRate, setVoiceRate] = useState([1]);
  const [speaking, setSpeaking] = useState(false);
  const [devicePanel, setDevicePanel] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [speechLanguage, setSpeechLanguage] = useState("ar");
  const [displayLanguage, setDisplayLanguage] = useState("en");
  const muteControl = getMicrophoneMuteControlCopy(muted);
  const liveTranscriptionStatus = getLiveTranscriptionStatus(recording ? "listening" : "idle");

  const meetingDetails = trpc.meetings.byInvite.useQuery({ inviteCode }, { enabled: validInviteCode });
  const privacy = trpc.meetings.privacyStatus.useQuery({ inviteCode }, { enabled: Boolean(user && validInviteCode) });
  const inviteSharingEnabled = meetingDetails.data?.inviteSharingEnabled ?? requestedInviteSharingEnabled;
  const translateText = trpc.translation.translateText.useMutation();
  const saveSegment = trpc.meetings.saveSegment.useMutation();
  const minutesPath = validInviteCode ? `/minutes/${inviteCode}` : "/minutes/design-sync";
  const draftPreview = useMemo(() => draft ? (translationOn ? "ستظهر الترجمة هنا قبل الإرسال لتراجعها قبل المشاركين." : "لن تترجم هذه الرسالة تلقائيًا.") : "اكتب رسالة لمشاركي الاجتماع…", [draft, translationOn]);

  const handleRecognizedText = useCallback(async (text: string) => {
    if (!text) return;
    let translatedText = text;
    try {
      if (user) {
        const result = await translateText.mutateAsync({ text, sourceLanguage: speechLanguage, targetLanguage: displayLanguage });
        translatedText = result.translation;
      }
    } catch {
      toast.error("ظهر النص، لكن تعذر إكمال ترجمته الآلية هذه المرة.");
    }
    setTranscript(current => [...current, { id: Date.now(), speaker: user?.name || "أنت", initials: "أ", origin: text, translation: translatedText, time: "الآن", language: languageLabels[speechLanguage] ?? speechLanguage, tone: "bg-amber-100 text-amber-800" }]);
    if (user && validInviteCode && privacy.data?.persistenceAllowed) {
      saveSegment.mutate({ inviteCode, sourceLanguage: "ar", targetLanguage: "en", originalText: text, translatedText });
    }
  }, [displayLanguage, inviteCode, privacy.data?.persistenceAllowed, saveSegment, speechLanguage, translateText, user, validInviteCode]);

  const liveSpeech = useLiveSpeech(speechLocales[speechLanguage] ?? "ar-SA", handleRecognizedText);
  const toggleLiveSpeech = () => {
    if (liveSpeech.isListening) { liveSpeech.stop(); setRecording(false); return; }
    if (!liveSpeech.isSupported) { toast.error("النسخ الحي غير مدعوم في هذا المتصفح. استخدم متصفحًا حديثًا أو أضف مقطعًا تجريبيًا."); return; }
    if (liveSpeech.start()) { setRecording(true); toast.success("بدأ الاستماع من الميكروفون. ستُترجم المقاطع النهائية تلقائيًا."); }
  };

  const addDemoSegment = () => {
    const item = demoSegments[demoIndex % demoSegments.length];
    setTranscript(current => [...current, { ...item, id: Date.now() }]);
    setDemoIndex(value => value + 1);
    toast.success("أُضيف مقطع مترجم إلى النص الحي.");
  };

  const sendMessage = async () => {
    const original = draft.trim();
    if (!original) return;
    let translated = "لم تُطلب ترجمة لهذه الرسالة.";
    if (translationOn && user) {
      try { translated = (await translateText.mutateAsync({ text: original, sourceLanguage: speechLanguage, targetLanguage: displayLanguage })).translation; }
      catch { translated = "تعذرت الترجمة الآن؛ أُرسلت الرسالة بنصها الأصلي."; }
    }
    setChat(current => [...current, { id: Date.now(), sender: "أنت", origin: original, translation: translated, mine: true, time: "الآن" }]);
    setDraft("");
  };

  const copyInvite = async () => {
    if (!inviteSharingEnabled) { toast.info("أدوات مشاركة رابط الدعوة متوقفة لهذه الجلسة."); return; }
    const path = validInviteCode ? `/join/${inviteCode}` : "/lobby";
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); toast.success("نُسخ رابط الدعوة إلى الحافظة."); }
    catch { toast.info(`رابط الدعوة: ${path}`); }
  };

  const shareInviteToWhatsApp = () => {
    if (!inviteSharingEnabled) { toast.info("أدوات مشاركة رابط الدعوة متوقفة لهذه الجلسة."); return; }
    if (!validInviteCode) { toast.error("أنشئ اجتماعًا برابط دعوة صالح أولًا."); return; }
    window.open(buildMeetingInviteShare(window.location.origin, inviteCode, meetingDetails.data?.title), "_blank", "noopener,noreferrer");
  };

  const speakLatestTranslation = () => {
    if (!("speechSynthesis" in window)) { toast.error("القراءة الصوتية غير متاحة في هذا المتصفح."); return; }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const text = transcript[transcript.length - 1]?.translation;
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-SA";
    utterance.rate = voiceRate[0];
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return <div className="min-h-screen bg-[#f6f7fb]" dir="rtl"><span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveTranscriptionStatus}</span>
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl"><div className="mx-auto flex h-[70px] max-w-[1580px] items-center justify-between gap-3 px-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setLocation("/")} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="العودة للرئيسية"><ChevronLeft className="h-5 w-5" /></button><div className="hidden sm:block"><LinguaBrand compact /></div><span className="hidden h-6 w-px bg-slate-200 sm:block" /><div className="min-w-0"><h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{meetingDetails.data?.title ?? "مزامنة خطة الإطلاق"}</h1><p className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">3 مشاركين · بدأ قبل 18 دقيقة</p></div></div><div className="flex gap-2">{inviteSharingEnabled && <><Button onClick={copyInvite} variant="outline" size="sm" className="h-9 rounded-xl text-xs"><Share2 className="ml-1.5 h-4 w-4" />دعوة</Button><Button onClick={shareInviteToWhatsApp} variant="outline" size="sm" className="h-9 rounded-xl border-emerald-200 text-xs text-emerald-700 hover:bg-emerald-50">واتساب</Button></>}<Button onClick={() => setLocation(minutesPath)} size="sm" className="h-9 rounded-xl bg-slate-950 text-xs hover:bg-slate-800"><FileText className="ml-1.5 h-4 w-4" />المحضر</Button></div></div></header>
    <main className="mx-auto max-w-[1580px] px-3 py-4 pb-24 sm:px-5 sm:py-5 sm:pb-28">{devicePanel && <MeetingAudioSettings onClose={() => setDevicePanel(false)} speechLanguage={speechLanguage} displayLanguage={displayLanguage} onSpeechLanguageChange={language => { if (language === speechLanguage) return; if (liveSpeech.isListening) { liveSpeech.stop(); setRecording(false); toast.info("توقف النسخ الحي لتطبيق لغة الحديث الجديدة."); } setSpeechLanguage(language); }} onDisplayLanguageChange={setDisplayLanguage} />}<section className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_330px]">
      <aside className="order-2 xl:order-1"><div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_16px_34px_-28px_rgba(44,49,94,.35)]"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold text-slate-800"><UsersRound className="h-4 w-4 text-indigo-600" />المشاركون</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">3</span></div><div className="mt-4 space-y-3">{participants.map((participant, index) => <div key={participant.name} className="flex items-center gap-2.5"><AvatarMark initials={participant.initials} tone={participant.tone} active={index === 0} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{participant.name}{index === 0 && <span className="mr-1 text-[10px] font-normal text-slate-400">(أنت)</span>}</p><p className="mt-0.5 text-[10px] text-slate-500">{participant.speech} <span className="text-slate-300">←</span> {participant.display}</p></div>{index === 0 && <Mic className="h-3.5 w-3.5 text-emerald-500" />}</div>)}</div><button onClick={copyInvite} type="button" className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"><Plus className="h-3.5 w-3.5" />إضافة مشارك</button></div><div className="mt-4 hidden rounded-[22px] border border-indigo-100 bg-indigo-50/60 p-4 xl:block"><span className="flex items-center gap-2 text-xs font-bold text-indigo-900"><Sparkles className="h-4 w-4" />مساعد الاجتماع</span><p className="mt-2 text-[11px] leading-5 text-slate-600">التقطنا نقطتين تحتاجان مراجعة في المحضر بعد انتهاء الاجتماع.</p><Button onClick={() => setLocation(minutesPath)} variant="ghost" className="mt-2 h-auto px-0 text-xs font-bold text-indigo-700 hover:bg-transparent">عرض النقاط <ChevronLeft className="mr-1 h-3.5 w-3.5" /></Button></div></aside>
      <section className="order-1 min-w-0 xl:order-2"><div className="overflow-hidden rounded-[25px] border border-slate-200/80 bg-white shadow-[0_22px_44px_-34px_rgba(44,49,94,.4)]"><div className="border-b border-slate-100 px-4 pb-0 pt-4 sm:px-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${recording ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${recording ? "animate-pulse bg-rose-500" : "bg-slate-400"}`} />{recording ? "النص الحي يعمل" : "النص الحي متوقف"}</div><h2 className="mt-2 text-lg font-bold tracking-[-.035em] text-slate-900">النص والترجمة الفورية</h2></div><Tabs value={activePanel} onValueChange={setActivePanel}><TabsList className="h-9 rounded-xl bg-slate-100 p-1"><TabsTrigger value="transcript" className="rounded-lg px-3 text-xs">النص</TabsTrigger><TabsTrigger value="summary" className="rounded-lg px-3 text-xs">النقاط</TabsTrigger></TabsList></Tabs></div><div className="mt-4 h-px bg-slate-100" /></div>{activePanel === "transcript" ? <div className="soft-scrollbar max-h-[570px] overflow-y-auto p-4 sm:p-5"><div className="mb-4 grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-400"><div className="rounded-lg bg-slate-50 px-3 py-2">النص الأصلي</div><div className="rounded-lg bg-indigo-50 px-3 py-2 text-indigo-400">ترجمتك المباشرة</div></div><div className="space-y-3">{transcript.map((segment, index) => <article key={segment.id} className="rounded-2xl border border-slate-100 p-3.5 sm:p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><AvatarMark initials={segment.initials} tone={segment.tone} active={index === transcript.length - 1 && recording} /><div><p className="text-xs font-bold text-slate-800">{segment.speaker}</p><p className="mt-0.5 text-[10px] text-slate-400">{segment.language} · {segment.time}</p></div></div>{index === transcript.length - 1 && recording && <AudioBars active color="emerald" />}</div><div className="grid gap-3 md:grid-cols-2"><p className={segment.language === "English" ? "dir-ltr rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700" : "rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700"}>{segment.origin}</p><p className="rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-slate-700">{segment.translation}</p></div></article>)}</div><button onClick={addDemoSegment} type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 py-3 text-xs font-bold text-indigo-600 hover:bg-indigo-50"><Captions className="h-4 w-4" />إضافة مقطع تجريبي</button></div> : <div className="p-5"><div className="rounded-2xl bg-indigo-50/70 p-4"><p className="text-xs font-bold text-indigo-700">مستخلص أثناء الاجتماع</p><h3 className="mt-2 font-bold text-slate-900">نقاط المتابعة</h3><div className="mt-4 space-y-2">{["تأكيد أسواق التجربة قبل تثبيت الجدول الزمني.", "إعداد تجربة تهيئة مبسطة للمستخدمين الجدد.", "إرسال ملخص مخاطر الإطلاق للفريق."].map((point, index) => <p key={point} className="flex gap-2 rounded-xl bg-white p-3 text-sm leading-6 text-slate-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{index + 1}</span>{point}</p>)}</div><Button onClick={() => setLocation(minutesPath)} className="mt-4 rounded-xl bg-indigo-600 text-xs">فتح المحضر للمراجعة</Button></div></div>}</div></section>
      <aside className="order-3"><div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_16px_34px_-28px_rgba(44,49,94,.35)]"><div className="border-b border-slate-100 p-4"><span className="flex items-center gap-2 text-sm font-bold text-slate-800"><MessageSquareText className="h-4 w-4 text-indigo-600" />محادثة مترجمة</span></div><div className="soft-scrollbar h-[250px] space-y-3 overflow-y-auto p-4">{chat.map(message => <div key={message.id} className={message.mine ? "mr-7" : "ml-7"}><div className="mb-1 text-[10px] text-slate-400"><span className="font-bold text-slate-600">{message.sender}</span> · {message.time}</div><div className={`rounded-2xl p-3 text-xs leading-5 ${message.mine ? "rounded-tr-sm bg-indigo-600 text-white" : "rounded-tl-sm bg-slate-100 text-slate-700"}`}><p className={message.sender === "Daniel Brooks" ? "dir-ltr" : ""}>{message.origin}</p><p className={`mt-2 border-t pt-2 ${message.mine ? "border-white/20 text-indigo-100" : "border-slate-200 text-slate-500"}`}>{message.translation}</p></div></div>)}</div><div className="border-t border-slate-100 p-3"><div className="rounded-xl border border-slate-200 p-2"><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="اكتب رسالة…" className="h-11 w-full resize-none bg-transparent px-1 py-1 text-xs outline-none placeholder:text-slate-400" /><p className="mt-1 rounded-lg bg-indigo-50 px-2 py-1.5 text-[10px] leading-4 text-indigo-700"><b>معاينة الترجمة: </b>{draftPreview}</p><div className="mt-2 flex items-center justify-between"><button type="button" onClick={() => setTranslationOn(value => !value)} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold ${translationOn ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-500"}`}><Languages className="h-3.5 w-3.5" />{translationOn ? "ترجمة قبل الإرسال" : "بدون ترجمة"}</button><button type="button" onClick={() => void sendMessage()} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-white"><Send className="h-3.5 w-3.5" /></button></div></div></div></div><button type="button" onClick={() => setDevicePanel(value => !value)} className="mt-4 flex w-full items-center justify-between rounded-[22px] border border-slate-200/80 bg-white px-4 py-3.5 text-right shadow-[0_16px_34px_-28px_rgba(44,49,94,.35)]"><span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-slate-500" /><span><b className="block text-xs text-slate-800">إعدادات اللغة والصوت</b><span className="block pt-0.5 text-[10px] text-slate-500">العربية · صوت ندى · {voiceRate[0].toFixed(1)}×</span></span></span><ChevronLeft className="h-4 w-4 text-slate-400" /></button>{devicePanel && <div className="mt-2 rounded-[20px] border border-slate-200 bg-white p-4"><p className="text-xs font-bold text-slate-700">لغة العرض والاستماع</p><Select defaultValue="ar"><SelectTrigger className="mt-2 h-10 rounded-xl text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem><SelectItem value="fr">Français</SelectItem></SelectContent></Select><div className="mt-4 flex justify-between text-xs font-bold text-slate-700"><span>سرعة القراءة</span><span>{voiceRate[0].toFixed(1)}×</span></div><Slider value={voiceRate} min={0.7} max={1.4} step={0.1} onValueChange={setVoiceRate} className="mt-3" /></div>}</aside>
    </section></main>
    <footer className="sticky bottom-0 z-30 border-t border-slate-200/85 bg-white/95 px-3 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-[760px] items-center justify-between gap-2"><div className="flex gap-2"><ControlButton label={muteControl.label} active={muteControl.active} onClick={() => setMuted(value => !value)}>{muted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}</ControlButton><ControlButton label="اختبار جهاز الصوت" onClick={() => toast.info("اختبر الميكروفون من الردهة أو اسمح للمتصفح بالوصول إلى الجهاز.")}><Headphones className="h-4.5 w-4.5" /></ControlButton><ControlButton label={recording ? "إيقاف النص الحي" : "تشغيل النص الحي"} active={recording} onClick={toggleLiveSpeech}>{recording ? <Captions className="h-4.5 w-4.5" /> : <Pause className="h-4.5 w-4.5" />}</ControlButton></div><div className="hidden text-center sm:block"><p className="text-xs font-bold text-slate-700">00:18:42</p><p className="mt-0.5 text-[10px] text-slate-400">{privacy.data?.persistenceAllowed ? "الحفظ مفعل بموافقة الحاضرين" : "الحفظ بانتظار موافقة الحاضرين"}</p></div><div className="flex gap-2"><ControlButton label={speaking ? "إيقاف قراءة الترجمة" : "قراءة آخر ترجمة"} active={speaking} onClick={speakLatestTranslation}>{speaking ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}</ControlButton><span className={`hidden items-center gap-1.5 rounded-xl px-3 text-xs font-bold sm:flex ${privacy.data?.persistenceAllowed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{privacy.data?.persistenceAllowed ? <LockKeyhole className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{privacy.data?.persistenceAllowed ? "الحفظ مفعل" : "الحفظ متوقف"}</span><Button onClick={() => { toast.success("انتهت الجلسة في واجهة العرض. يمكنك الآن مراجعة المحضر."); setLocation(minutesPath); }} className="h-10 rounded-xl bg-rose-500 px-3 text-xs font-bold text-white hover:bg-rose-600"><CircleStop className="ml-1.5 h-4 w-4" />إنهاء</Button></div></div></footer>
  </div>;
}
