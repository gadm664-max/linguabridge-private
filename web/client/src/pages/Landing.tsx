import AppNavigation from "@/components/AppNavigation";
import AudioBars from "@/components/AudioBars";
import LinguaBrand from "@/components/LinguaBrand";
import { ArrowLeft, Captions, CheckCircle2, ChevronLeft, FileText, Globe2, Headphones, LockKeyhole, Mic2, Sparkles, UsersRound } from "lucide-react";
import { Link } from "wouter";

const languages = ["العربية", "English", "Français", "Español", "日本語"];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden">
      <AppNavigation />
      <main>
        <section className="relative mx-auto max-w-[1440px] px-4 pb-20 pt-10 sm:px-7 lg:pb-28 lg:pt-16">
          <div className="absolute left-[-13rem] top-[6rem] -z-10 h-[26rem] w-[26rem] rounded-full bg-violet-200/35 blur-3xl" />
          <div className="grid items-center gap-14 lg:grid-cols-[1.02fr_.98fr] lg:gap-10">
            <div className="max-w-2xl pt-2 lg:pt-10">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-indigo-600 text-white"><Sparkles className="h-3 w-3" /></span>
                اجتماع واحد، فهمٌ مشترك
              </div>
              <h1 className="font-display max-w-[680px] text-[clamp(2.65rem,5.4vw,5.3rem)] font-bold leading-[1.04] tracking-[-.065em] text-slate-950">
                عندما تتحدث اللغات المختلفة، <span className="bg-gradient-to-l from-indigo-600 to-violet-500 bg-clip-text text-transparent">يبقى الحوار واحدًا.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
                LinguaBridge يحوّل الحديث والنص إلى فهم لحظي؛ يختار كل مشارك لغته، ويشاهد الأصل والترجمة، ثم يخرج بمحضر واضح ومشاركته سهلة.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/lobby" className="group inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-xl shadow-slate-900/15 hover:bg-slate-800">
                  أنشئ اجتماعًا جديدًا <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                </Link>
                <a href="#how" className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50">كيف تعمل المنصة؟</a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-500">
                {[[LockKeyhole, "موافقة واضحة قبل الحفظ"], [Globe2, "لغات واتجاهات متعددة"], [FileText, "محضر قابل للتصدير"]].map(([Icon, label]) => {
                  const Symbol = Icon as typeof LockKeyhole;
                  return <span key={label as string} className="flex items-center gap-2"><Symbol className="h-4 w-4 text-indigo-500" />{label as string}</span>;
                })}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:mr-auto lg:ml-0">
              <div className="mesh-surface relative overflow-hidden rounded-[32px] p-3 shadow-[0_30px_85px_-35px_rgba(31,35,91,.8)]">
                <div className="absolute -left-20 top-16 h-48 w-48 rounded-full bg-indigo-300/20 blur-3xl" />
                <div className="relative min-h-[495px] rounded-[24px] border border-white/15 bg-slate-950/22 p-4 sm:p-5">
                  <div className="flex items-center justify-between text-white/85">
                    <LinguaBrand inverse />
                    <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />جلسة مباشرة</div>
                  </div>
                  <div className="mt-7 rounded-2xl border border-white/10 bg-white/[.11] p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-xs font-bold text-orange-950">م</span><div><p className="text-sm font-bold text-white">مايا حداد</p><p className="mt-0.5 text-[11px] text-indigo-100">العربية ← English</p></div></div>
                      <div className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/80">يتحدث الآن</div>
                    </div>
                    <div className="mt-3"><AudioBars active color="emerald" /></div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>الأصل</span><span>AR</span></div><p className="text-sm font-semibold leading-6 text-slate-800">أقترح أن نبدأ بنطاق الإطلاق، ثم نراجع المراحل مع الفريق.</p></div>
                    <div className="rounded-2xl bg-indigo-50/95 p-4 shadow-sm"><div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-indigo-400"><span>Translation</span><span>EN</span></div><p className="dir-ltr text-sm font-semibold leading-6 text-slate-800">I suggest we start with the launch scope, then review the milestones with the team.</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] p-3 text-white/85"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-400/20"><Captions className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between text-[11px] font-bold"><span>النسخ الحي</span><span className="text-indigo-200">متزامن</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/15"><span className="block h-full w-[72%] rounded-full bg-gradient-to-l from-indigo-300 to-violet-200" /></div></div></div>
                  <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/15 bg-slate-950/55 p-3.5 backdrop-blur-md"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Mic2 className="h-4 w-4" /></span><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><Headphones className="h-4 w-4" /></span></div><span className="text-xs font-semibold">00:18:42</span><span className="rounded-xl bg-rose-400 px-3 py-2 text-xs font-bold text-rose-950">إنهاء</span></div>
                </div>
              </div>
              <div className="absolute -bottom-5 -right-3 hidden rounded-2xl border border-white bg-white p-3 shadow-xl sm:flex sm:items-center sm:gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></span><div><p className="text-xs font-bold text-slate-800">ترجمة جاهزة</p><p className="text-[10px] text-slate-500">بصياغة طبيعية وواضحة</p></div></div>
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-slate-200/80 bg-white/60 px-4 py-16 sm:px-7 lg:py-22">
          <div className="mx-auto max-w-[1240px]">
            <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-bold text-indigo-600">من أول رابط إلى محضر واضح</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.045em] text-slate-900 sm:text-4xl">مصممة للاجتماعات التي لا تقبل فقدان المعنى</h2></div>
            <div className="mt-11 grid gap-4 md:grid-cols-3">
              {[
                [UsersRound, "1. ادعُ المشاركين", "رابط واحد وردهة قصيرة تضبط اللغات والأجهزة والموافقة قبل البدء."],
                [Captions, "2. تابع بلغتك", "نص أصلي وترجمة حية متجاورتان، مع تمييز المتحدث والتحكم في الصوت."],
                [FileText, "3. راجع وشارك", "محضر منظم يجمع اللغتين والنقاط الرئيسية لتراجعه أو تصدّره."],
              ].map(([Icon, title, body], index) => {
                const Symbol = Icon as typeof UsersRound;
                return <article key={title as string} className="hover-lift rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_30px_-28px_rgba(23,32,51,.4)]"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Symbol className="h-5 w-5" /></span><p className="mt-6 text-xs font-bold text-indigo-500">0{index + 1}</p><h3 className="mt-2 text-lg font-bold text-slate-900">{title as string}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{body as string}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-7">
          <div className="mx-auto grid max-w-[1240px] gap-9 rounded-[32px] border border-indigo-100 bg-gradient-to-l from-indigo-50 to-white p-7 sm:p-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div><p className="text-sm font-bold text-indigo-600">مرنة من البداية</p><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.045em] text-slate-900">لغة الحديث ليست عائقًا في واجهة مشتركة.</h2><p className="mt-4 leading-7 text-slate-600">لكل شخص لغة حديث، ولغة عرض، وصوت يفضله. تبقى عناصر الاجتماع واضحة حتى عند مزج العربية والإنجليزية والفرنسية في الحوار نفسه.</p><Link href="/lobby" className="mt-7 inline-flex items-center gap-2 font-bold text-indigo-700 hover:text-indigo-800">ابدأ جلسة تجريبية <ChevronLeft className="h-4 w-4" /></Link></div>
            <div className="flex flex-wrap gap-2.5" aria-label="لغات مدعومة في الواجهة التجريبية">{languages.map((language, index) => <span key={language} className={`rounded-full border px-4 py-2 text-sm font-semibold ${index === 0 ? "border-indigo-200 bg-indigo-600 text-white" : "border-white bg-white text-slate-600 shadow-sm"}`}>{language}</span>)}</div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 px-4 py-8 sm:px-7"><div className="mx-auto flex max-w-[1440px] flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><LinguaBrand compact /><p>واجهة أولية لمنصة اجتماعات متعددة اللغات.</p></div></footer>
    </div>
  );
}
