import AppNavigation from "@/components/AppNavigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { buildMinutesShare } from "@/lib/whatsapp";
import { Download, FileDown, Languages, ListChecks, LockKeyhole, LogIn, Share2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function Minutes() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/minutes/:sessionId");
  const inviteCode = params?.sessionId?.toUpperCase() ?? "";
  const validInviteCode = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,16}$/.test(inviteCode);
  const { user, loading } = useAuth();
  const record = trpc.minutes.get.useQuery({ inviteCode }, { enabled: Boolean(user && validInviteCode) });
  const generate = trpc.minutes.generate.useMutation({
    onSuccess: () => { toast.success("أُنشئ المحضر وحُفظ في سجلك."); void record.refetch(); },
    onError: error => toast.error(error.message || "تعذر إنشاء المحضر."),
  });

  const minutes = record.data?.minutes;
  const segments = record.data?.segments ?? [];
  const summary = minutes?.summary ?? "سيظهر ملخص الاجتماع هنا بعد حفظ مقاطع النص وتوليد المحضر بموافقة المشاركين.";
  const points = minutes?.keyPoints ?? [];
  const actions = minutes?.actionItems ?? [];
  const title = record.data?.meeting.title ?? "محضر الاجتماع";

  const exportMinutes = () => {
    window.print();
    toast.success("فُتحت نافذة الطباعة؛ يمكنك اختيار حفظ نسخة PDF.");
  };

  const shareMinutesToWhatsApp = () => {
    if (!validInviteCode) {
      toast.error("لا يتوفر رابط محضر صالح للمشاركة.");
      return;
    }
    window.open(buildMinutesShare(window.location.origin, inviteCode, title), "_blank", "noopener,noreferrer");
  };

  if (!loading && !user) {
    return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto grid max-w-xl place-items-center px-4 py-28"><div className="rounded-[24px] border border-indigo-100 bg-white p-8 text-center shadow-sm"><LogIn className="mx-auto h-7 w-7 text-indigo-600" /><h1 className="mt-4 text-xl font-bold text-slate-900">سجّل الدخول لمراجعة المحضر</h1><p className="mt-2 text-sm leading-6 text-slate-500">تُحمى محاضر الاجتماعات ومحتوياتها بالحساب وموافقات المشاركين.</p><Button onClick={startLogin} className="mt-5 rounded-xl bg-indigo-600">تسجيل الدخول</Button></div></main></div>;
  }

  return <div className="min-h-screen bg-slate-50"><AppNavigation /><main className="mx-auto max-w-[1220px] px-4 py-8 sm:px-7 sm:py-11">
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <button type="button" onClick={() => setLocation("/history")} className="mb-4 text-xs font-bold text-slate-500 hover:text-indigo-700">← العودة إلى سجل الجلسات</button>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">محضر قابل للمراجعة</span><span className="text-xs font-medium text-slate-400">الأصل والترجمة والنقاط الرئيسية</span></div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-.055em] text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">راجِع المحضر قبل مشاركته. يشارك WhatsApp رابط المراجعة فقط، ولا يضيف أي نص من الاجتماع إلى الرسالة.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={shareMinutesToWhatsApp} className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Share2 className="ml-2 h-4 w-4" />مشاركة عبر واتساب</Button>
        <Button onClick={exportMinutes} className="rounded-xl bg-slate-950 hover:bg-slate-800"><Download className="ml-2 h-4 w-4" />تصدير PDF</Button>
      </div>
    </header>

    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="space-y-6">
        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(41,48,92,.32)] sm:p-6">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-lg font-bold text-slate-900"><Sparkles className="h-5 w-5 text-indigo-600" />الملخص التنفيذي</span>{!minutes && <Button disabled={generate.isPending || !validInviteCode} onClick={() => generate.mutate({ inviteCode, targetLanguage: "ar" })} className="rounded-xl bg-indigo-600 text-xs">{generate.isPending ? "يجري التوليد…" : "توليد المحضر"}</Button>}</div>
          <p className="mt-4 whitespace-pre-line leading-8 text-slate-700">{summary}</p>
          {points.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{points.map(point => <div key={point} className="rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-indigo-950">{point}</div>)}</div>}
        </article>

        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(41,48,92,.32)] sm:p-6">
          <span className="flex items-center gap-2 text-lg font-bold text-slate-900"><ListChecks className="h-5 w-5 text-indigo-600" />الإجراءات والمتابعة</span>
          {actions.length > 0 ? <div className="mt-4 space-y-3">{actions.map((item, index) => <label key={item} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 p-3"><Checkbox id={`action-${index}`} className="mt-0.5" /><span className="text-sm leading-6 text-slate-700">{item}</span></label>)}</div> : <p className="mt-4 text-sm leading-6 text-slate-500">لا توجد إجراءات مستخلصة بعد. أنشئ المحضر بعد حفظ نصوص الجلسة.</p>}
        </article>

        <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_36px_-30px_rgba(41,48,92,.32)] sm:p-6">
          <span className="flex items-center gap-2 text-lg font-bold text-slate-900"><Languages className="h-5 w-5 text-indigo-600" />النص والترجمة</span>
          {record.isLoading ? <p className="mt-4 text-sm text-slate-500">يجري تحميل المقاطع المحفوظة…</p> : segments.length > 0 ? <div className="mt-5 space-y-3">{segments.map(segment => <article key={segment.id} className="rounded-2xl border border-slate-100 p-4"><div className="mb-3 flex justify-between text-[11px]"><span className="font-bold text-slate-700">{segment.speakerName}</span><span className="text-slate-400">{new Date(segment.happenedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span></div><div className="grid gap-3 md:grid-cols-2"><p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{segment.originalText}</p><p className="rounded-xl bg-indigo-50 p-3 text-sm leading-6 text-slate-700">{segment.translatedText}</p></div></article>)}</div> : <p className="mt-4 text-sm leading-6 text-slate-500">لا توجد مقاطع محفوظة لهذه الجلسة، أو أن الحفظ لم يُفعّل بموافقة الجميع.</p>}
        </article>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-5"><span className="flex items-center gap-2 text-sm font-bold text-slate-800"><LockKeyhole className="h-4 w-4 text-emerald-600" />خصوصية المحضر</span><p className="mt-3 text-xs leading-6 text-slate-500">لا يُنشأ المحضر من الخادم إلا عندما يكون حفظ المحتوى مفعّلًا بموافقة المشاركين الحاضرين. مشاركة WhatsApp لا تتضمن محتوى المحضر.</p></div>
        <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 p-5"><FileDown className="h-5 w-5 text-emerald-600" /><h2 className="mt-3 text-sm font-bold text-emerald-950">أرسل رابط المراجعة بأمان</h2><p className="mt-2 text-xs leading-6 text-emerald-900/70">يفتح الرابط واتساب لتختار المستلم بنفسك. لا يحتفظ LinguaBridge بقائمة جهات اتصالك ولا ينشر نصوص الاجتماع.</p><Button onClick={shareMinutesToWhatsApp} variant="outline" className="mt-4 w-full rounded-xl border-emerald-200 bg-white text-xs font-bold text-emerald-700">فتح واتساب</Button></div>
        <button type="button" onClick={() => toast.info("حذف المحضر يتطلب تأكيدًا نهائيًا قبل إزالته من الحساب.")} className="flex w-full items-center justify-center gap-1.5 rounded-xl p-2 text-xs font-bold text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />طلب حذف هذا المحضر</button>
      </aside>
    </div>
  </main></div>;
}
