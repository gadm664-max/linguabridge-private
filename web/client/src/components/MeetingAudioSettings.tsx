import { CheckCircle2, CircleAlert, Headphones, Mic, MicOff, SlidersHorizontal, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateAudioLevel } from "@/lib/audioInput";
import { supportedLanguages } from "../../../shared/meetingSpecs";

type AudioInput = { id: string; label: string };

export default function MeetingAudioSettings({
  onClose,
  speechLanguage,
  displayLanguage,
  onSpeechLanguageChange,
  onDisplayLanguageChange,
}: {
  onClose: () => void;
  speechLanguage: string;
  displayLanguage: string;
  onSpeechLanguageChange: (language: string) => void;
  onDisplayLanguageChange: (language: string) => void;
}) {
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [selectedInput, setSelectedInput] = useState("system-default");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "ready" | "unsupported" | "denied" | "error">("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);

  const stopTest = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setTesting(false);
    setLevel(0);
  }, []);

  const refreshInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus("unsupported");
      return;
    }
    try {
      const nextInputs = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === "audioinput")
        .map((device, index) => ({ id: device.deviceId, label: device.label || `ميكروفون ${index + 1}` }));
      setInputs(nextInputs);
      setSelectedInput(current => current !== "system-default" && !nextInputs.some(input => input.id === current) ? "system-default" : current);
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshInputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshInputs);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshInputs);
  }, [refreshInputs]);

  useEffect(() => () => stopTest(), [stopTest]);

  const startTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setStatus("unsupported");
      return;
    }
    stopTest();
    try {
      const deviceId = selectedInput === "system-default" ? undefined : selectedInput;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      streamRef.current = stream;
      await refreshInputs();
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      contextRef.current = context;
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        setLevel(calculateAudioLevel(samples));
        frameRef.current = requestAnimationFrame(measure);
      };
      measure();
      setStatus("ready");
      setTesting(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      stopTest();
    }
  };

  const statusMessage = {
    idle: "اختر جهاز إدخال ثم ابدأ الاختبار. لا يُرسل الصوت أو يُحفظ أثناء الاختبار.",
    ready: "يصل صوت من الميكروفون. حرّك المؤشر للتأكد من مستوى الصوت.",
    unsupported: "لا يدعم هذا المتصفح اختيار أجهزة الصوت أو اختبارها.",
    denied: "تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.",
    error: "تعذر تشغيل الاختبار. تحقق من اتصال الجهاز أو أغلِق التطبيقات التي تستخدم الميكروفون.",
  }[status];

  return <section aria-label="إعدادات الصوت واللغة" className="mt-4 overflow-hidden rounded-[22px] border border-indigo-100 bg-white shadow-[0_18px_40px_-32px_rgba(44,49,94,.45)]">
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
      <div><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><SlidersHorizontal className="h-4 w-4 text-indigo-600" />إعدادات اللغة والصوت</p><p className="mt-1 text-[11px] leading-5 text-slate-500">تُطبق اللغة المختارة على النسخ والترجمة التاليين في هذه الجلسة.</p></div>
      <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="إغلاق إعدادات الصوت"><X className="h-4 w-4" /></button>
    </div>
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <label className="block"><span className="text-xs font-bold text-slate-700">لغة حديثي</span><Select value={speechLanguage} onValueChange={onSpeechLanguageChange}><SelectTrigger className="mt-2 h-10 rounded-xl text-xs"><SelectValue /></SelectTrigger><SelectContent>{supportedLanguages.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
      <label className="block"><span className="text-xs font-bold text-slate-700">لغة الترجمة المعروضة</span><Select value={displayLanguage} onValueChange={onDisplayLanguageChange}><SelectTrigger className="mt-2 h-10 rounded-xl text-xs"><SelectValue /></SelectTrigger><SelectContent>{supportedLanguages.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
    </div>
    <div className="border-t border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold text-slate-800"><Mic className="h-4 w-4 text-indigo-600" />جهاز إدخال الميكروفون</p><p className="mt-1 text-[11px] text-slate-500">يُستخدم لاختبار الإذن ومستوى الصوت على جهازك.</p></div><Button onClick={() => testing ? stopTest() : void startTest()} variant={testing ? "outline" : "default"} className={testing ? "h-9 rounded-xl border-rose-200 text-xs text-rose-700 hover:bg-rose-50" : "h-9 rounded-xl bg-slate-950 text-xs hover:bg-slate-800"}>{testing ? <><MicOff className="ml-1.5 h-4 w-4" />إيقاف الاختبار</> : <><Headphones className="ml-1.5 h-4 w-4" />اختبار الميكروفون</>}</Button></div>
      <Select value={selectedInput} onValueChange={value => { stopTest(); setSelectedInput(value); }}><SelectTrigger className="mt-3 h-10 rounded-xl text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system-default">الجهاز الافتراضي للنظام</SelectItem>{inputs.map(input => <SelectItem key={input.id} value={input.id}>{input.label}</SelectItem>)}</SelectContent></Select>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><Volume2 className="h-3.5 w-3.5 text-indigo-600" />مستوى الإدخال</span><span aria-live="polite" className="text-[11px] font-bold text-slate-500">{testing ? `${level}%` : "غير نشط"}</span></div><div role="progressbar" aria-label="مستوى إدخال الميكروفون" aria-valuemin={0} aria-valuemax={100} aria-valuenow={testing ? level : undefined} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-indigo-500 to-indigo-600 transition-[width] duration-100" style={{ width: `${testing ? Math.max(3, level) : 0}%` }} /></div></div>
      <p role="status" aria-live="polite" className={`mt-3 flex gap-2 rounded-xl px-3 py-2 text-[11px] leading-5 ${status === "ready" ? "bg-emerald-50 text-emerald-700" : status === "idle" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-800"}`}>{status === "ready" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{statusMessage}</p>
    </div>
  </section>;
}
