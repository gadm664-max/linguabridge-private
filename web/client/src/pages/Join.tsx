import AppNavigation from "@/components/AppNavigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Languages, LockKeyhole, Mic2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { supportedLanguages } from "../../../shared/meetingSpecs";

export default function Join() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/join/:sessionId");
  const inviteCode = params?.sessionId?.toUpperCase() ?? "";
  const { user, loading } = useAuth();
  const [speakingLanguage, setSpeakingLanguage] = useState("ar");
  const [displayLanguage, setDisplayLanguage] = useState("en");
  const [consent, setConsent] = useState(false);
  const meeting = trpc.meetings.byInvite.useQuery({ inviteCode }, { enabled: Boolean(inviteCode) });
  const join = trpc.meetings.join.useMutation({
    onSuccess: () => { toast.success("انضممت إلى الاجتماع. أهلاً بك."); setLocation(`/meeting/${inviteCode}`); },
    onError: error => toast.error(error.message || "تعذر الانضمام إلى الجلسة."),
  });

  const submit = () => {
    if (!user) { toast.info("سجّل الدخول أولًا للانضمام إلى الجلسة بصورة آمنة."); startLogin(); return; }
    if (meeting.data?.storageConsent && !consent) { toast.error("يلزم تأكيد موافقتك قبل حفظ أي محتوى في هذه الجلسة."); return; }
    join.mutate({ inviteCode, speakingLanguage, displayLanguage, voiceName: "natural", voiceRate: "1.0", storageConsent: consent });
  };

  if (meeting.isLoading || loading) return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto grid max-w-xl place-items-center px-4 py-28"><div className="rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-4 text-sm font-bold text-slate-700">نتحقق من رابط الدعوة…</p></div></main></div>;
  if (meeting.isError || !meeting.data) return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto grid max-w-xl place-items-center px-4 py-28"><div className="rounded-[24px] border border-rose-100 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto h-7 w-7 text-rose-500" /><h1 className="mt-4 text-xl font-bold text-slate-900">رابط الدعوة غير متاح</h1><p className="mt-2 text-sm leading-6 text-slate-500">تأكد من أن الرابط كامل وصالح، أو اطلب رابط دعوة جديدًا من منظم الاجتماع.</p><Button onClick={() => setLocation("/")} className="mt-5 rounded-xl bg-slate-950">العودة للرئيسية</Button></div></main></div>;

  return <div className="min-h-screen bg-[radial-gradient(circle_at_83%_5%,rgba(224,231,255,.85),transparent_27rem),#f8f9fd]"><AppNavigation /><main className="mx-auto max-w-[760px] px-4 py-10 sm:py-16"><div className="rounded-[30px] border border-white bg-white p-6 shadow-[0_28px_60px_-38px_rgba(42,48,100,.38)] sm:p-9"><div className="flex items-start justify-between gap-4"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />جلسة متاحة</span><h1 className="mt-4 font-display text-3xl font-bold tracking-[-.05em] text-slate-950">{meeting.data.title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">اختَر لغتك وطريقة عرض الترجمة، ثم انضم إلى المشاركين.</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><UsersRound className="h-6 w-6" /></span></div><div className="mt-8 grid gap-5 sm:grid-cols-2"><div><Label className="text-sm font-bold">لغة حديثك</Label><Select value={speakingLanguage} onValueChange={setSpeakingLanguage}><SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{supportedLanguages.map(language => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-sm font-bold">لغة العرض والاستماع</Label><Select value={displayLanguage} onValueChange={setDisplayLanguage}><SelectTrigger className="mt-2 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{supportedLanguages.map(language => <SelectItem key={language.value} value={language.value}>{language.label}</SelectItem>)}</SelectContent></Select></div></div><div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm"><Mic2 className="h-5 w-5" /></span><div><p className="text-sm font-bold text-slate-700">ستتمكن من اختبار الميكروفون داخل الجلسة</p><p className="mt-0.5 text-xs text-slate-500">يمكن تغيير الصوت والجهاز وسرعة القراءة لاحقًا.</p></div></div>{meeting.data.storageConsent ? <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><Checkbox checked={consent} onCheckedChange={value => setConsent(Boolean(value))} className="mt-0.5" /><span><span className="text-sm font-bold text-slate-800">أوافق على حفظ النص والترجمة ومحضر هذه الجلسة.</span><span className="mt-1 block text-xs leading-5 text-slate-500">سيُحفظ المحتوى فقط عندما يمنح كل المشاركين الحاضرين موافقته الصريحة.</span></span></label> : <div className="mt-6 flex gap-3 rounded-2xl border border-slate-200 p-4"><Languages className="mt-0.5 h-5 w-5 text-indigo-600" /><p className="text-sm leading-6 text-slate-600">هذه الجلسة لا تطلب حفظ المحتوى. ستبقى الترجمة مرئية خلال الاجتماع فقط.</p></div>}<Button disabled={join.isPending} onClick={submit} className="mt-7 h-12 w-full rounded-xl bg-indigo-600 text-sm font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700">{join.isPending ? "يجري الانضمام…" : "الانضمام إلى الاجتماع"} <CheckCircle2 className="mr-2 h-4 w-4" /></Button></div></main></div>;
}
