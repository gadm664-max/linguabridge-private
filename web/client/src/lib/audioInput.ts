export function calculateAudioLevel(bytes: Uint8Array) {
  if (!bytes.length) return 0;
  const total = bytes.reduce((sum, value) => sum + Math.abs(value - 128), 0);
  return Math.min(100, Math.round((total / bytes.length / 42) * 100));
}
