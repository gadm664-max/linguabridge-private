export type MeetingTranscription = {
  text: string;
  language: string;
  duration: number;
  segments: Array<{ start: number; end: number; text: string }>;
};

export type MeetingTranscriptionError = {
  error: string;
  code: "SERVICE_ERROR" | "TRANSCRIPTION_FAILED";
};

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{ transcript?: string }>;
    }>;
    utterances?: Array<{ start?: number; end?: number; transcript?: string }>;
  };
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function transcribeWithDeepgram(
  input: { audio: Buffer; mimeType: string; language: string },
  fetchImpl: FetchLike = fetch,
): Promise<MeetingTranscription | MeetingTranscriptionError> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return { error: "Deepgram transcription is not configured", code: "SERVICE_ERROR" };

  const query = new URLSearchParams({
    model: "nova-3",
    language: input.language,
    punctuate: "true",
    smart_format: "true",
    utterances: "true",
  });

  try {
    const response = await fetchImpl(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": input.mimeType,
      },
      body: new Uint8Array(input.audio).buffer,
    });
    if (!response.ok) return { error: "Deepgram transcription request failed", code: "TRANSCRIPTION_FAILED" };

    const result = await response.json() as DeepgramResponse;
    const channel = result.results?.channels?.[0];
    const text = channel?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!text) return { error: "Deepgram returned an empty transcription", code: "TRANSCRIPTION_FAILED" };

    const duration = result.metadata?.duration ?? 0;
    const segments = (result.results?.utterances ?? [])
      .map(utterance => ({ start: utterance.start ?? 0, end: utterance.end ?? duration, text: utterance.transcript?.trim() ?? "" }))
      .filter(utterance => Boolean(utterance.text));

    return {
      text,
      language: channel?.detected_language ?? input.language,
      duration,
      segments: segments.length ? segments : [{ start: 0, end: duration, text }],
    };
  } catch {
    return { error: "Deepgram transcription is temporarily unavailable", code: "SERVICE_ERROR" };
  }
}
