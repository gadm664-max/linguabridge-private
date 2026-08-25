import { useCallback, useEffect, useState } from "react";

type AudioDevice = { deviceId: string; label: string };

export function useAudioDevices() {
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === "audioinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `ميكروفون ${index + 1}` }));
    const audioOutputs = devices.filter(device => device.kind === "audiooutput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `سماعة ${index + 1}` }));
    setInputs(audioInputs);
    setOutputs(audioOutputs);
    setSelectedInput(current => current || audioInputs[0]?.deviceId || "");
    setSelectedOutput(current => current || audioOutputs[0]?.deviceId || "");
  }, []);

  const testMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("يتطلب اختبار الميكروفون متصفحًا يدعم الوصول الآمن إلى أجهزة الصوت.");
      return false;
    }
    try {
      setIsTesting(true);
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: selectedInput ? { deviceId: { exact: selectedInput } } : true });
      await refresh();
      window.setTimeout(() => { stream.getTracks().forEach(track => track.stop()); setIsTesting(false); }, 1800);
      return true;
    } catch {
      setError("لم نتمكن من الوصول إلى الميكروفون. تحقق من إذن المتصفح والجهاز المختار.");
      setIsTesting(false);
      return false;
    }
  }, [refresh, selectedInput]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [refresh]);

  return { inputs, outputs, selectedInput, selectedOutput, setSelectedInput, setSelectedOutput, isTesting, error, testMicrophone, refresh };
}
