import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionResultItem = { transcript: string };
type RecognitionResultLike = { isFinal: boolean; 0: RecognitionResultItem };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function useLiveSpeech(language: string, onFinalTranscript: (text: string) => void) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSupported = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => { callbackRef.current = onFinalTranscript; }, [onFinalTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setError("التعرّف الحي على الكلام غير مدعوم في هذا المتصفح.");
      return false;
    }
    if (recognitionRef.current) return true;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return false;
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) callbackRef.current(result[0]?.transcript.trim() ?? "");
      }
    };
    recognition.onerror = event => {
      setError(event.error === "not-allowed" ? "يجب السماح بالوصول إلى الميكروفون للنسخ الحي." : "تعذر بدء النسخ الحي. تحقق من جهاز الميكروفون.");
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setError(null);
      setIsListening(true);
      return true;
    } catch {
      setError("تعذر تشغيل النسخ الحي في هذه اللحظة.");
      return false;
    }
  }, [isSupported, language]);

  useEffect(() => () => recognitionRef.current?.stop(), []);
  return { start, stop, isListening, isSupported, error };
}
