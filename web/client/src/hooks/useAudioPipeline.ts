import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

const SEGMENT_DURATION_MS = 4000;

type RecognitionResultItem = { transcript: string };
type RecognitionResultLike = { isFinal: boolean; 0: RecognitionResultItem };
type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};
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

export type AudioPipelineResult = {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  durationSeconds: number;
  provider: string;
  model: string;
};

export function selectAudioMimeType(): "audio/webm" | "audio/mp4" {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
    return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "audio/mp4";
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(index, index + step))
    );
  }
  return btoa(binary);
}

export function useAudioPipeline({
  inviteCode,
  sourceLanguage,
  targetLanguage,
  onFinalTranscript,
}: {
  inviteCode: string;
  sourceLanguage: string;
  targetLanguage: string;
  onFinalTranscript: (result: AudioPipelineResult) => void;
}) {
  const transcribeMutation = trpc.voice.transcribeAndTranslate.useMutation();
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldContinueRef = useRef(false);
  const callbackRef = useRef(onFinalTranscript);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "listening" | "processing" | "error"
  >("idle");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [lastFinalTranscript, setLastFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const isSupported =
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    typeof MediaRecorder !== "undefined";
  const hasPartialRecognition =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const cleanupCapture = useCallback(() => {
    shouldContinueRef.current = false;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    cleanupCapture();
    setPartialTranscript("");
    setStatus("idle");
  }, [cleanupCapture]);

  const processSegment = useCallback(
    async (blob: Blob) => {
      if (!blob.size) return;
      setStatus("processing");
      try {
        const audioBase64 = await blobToBase64(blob);
        const result = await transcribeMutation.mutateAsync({
          inviteCode,
          audioBase64,
          mimeType: selectAudioMimeType(),
          sourceLanguage,
          targetLanguage,
        });
        setLastFinalTranscript(result.originalText);
        setPartialTranscript("");
        callbackRef.current(result);
        if (!shouldContinueRef.current) setStatus("idle");
      } catch {
        cleanupCapture();
        setError(
          "تعذر تحويل هذا المقطع الصوتي. تحقق من إعدادات STT ثم حاول مرة أخرى."
        );
        setStatus("error");
      }
    },
    [
      cleanupCapture,
      inviteCode,
      sourceLanguage,
      targetLanguage,
      transcribeMutation,
    ]
  );

  const startRecorderSegment = useCallback(
    (stream: MediaStream) => {
      if (!shouldContinueRef.current) return;
      const mimeType = selectAudioMimeType();
      let chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        chunks = [];
        void processSegment(blob).finally(() => {
          if (shouldContinueRef.current) {
            setStatus("listening");
            startRecorderSegment(stream);
          }
        });
      };
      recorder.start();
      segmentTimerRef.current = setTimeout(
        () => recorder.stop(),
        SEGMENT_DURATION_MS
      );
    },
    [processSegment]
  );

  const start = useCallback(async () => {
    if (!isSupported || shouldContinueRef.current) return false;
    setError(null);
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      shouldContinueRef.current = true;
      startRecorderSegment(stream);

      const Recognition =
        typeof window !== "undefined"
          ? window.SpeechRecognition || window.webkitSpeechRecognition
          : undefined;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang =
          sourceLanguage === "ar"
            ? "ar-SA"
            : sourceLanguage === "fr"
              ? "fr-FR"
              : "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = event => {
          let interim = "";
          for (
            let index = event.resultIndex;
            index < event.results.length;
            index += 1
          ) {
            const transcript =
              event.results[index]?.[0]?.transcript.trim() ?? "";
            if (transcript && !event.results[index]?.isFinal)
              interim += `${transcript} `;
          }
          setPartialTranscript(interim.trim());
        };
        recognition.onerror = event => {
          if (event.error === "not-allowed")
            setError("يجب السماح بالوصول إلى الميكروفون لاستخدام Phase 3A.");
        };
        recognition.onend = () => {
          if (shouldContinueRef.current) {
            try {
              recognition.start();
            } catch {
              /* Browser may already be restarting. */
            }
          }
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          /* Server STT remains available without browser partials. */
        }
      }
      setStatus("listening");
      return true;
    } catch {
      cleanupCapture();
      setError("تعذر الوصول إلى الميكروفون. تحقق من إذن المتصفح والجهاز.");
      setStatus("error");
      return false;
    }
  }, [cleanupCapture, isSupported, sourceLanguage, startRecorderSegment]);

  useEffect(() => () => stop(), [stop]);

  return {
    start,
    stop,
    status,
    error,
    partialTranscript,
    lastFinalTranscript,
    isSupported,
    hasPartialRecognition,
    isProcessing: status === "processing" || transcribeMutation.isPending,
  };
}
