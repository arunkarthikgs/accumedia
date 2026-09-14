import { ASRProvider, TranscribeAudioOptions, ASRResult } from "./types";

// 1. OpenAI Whisper Provider
export class OpenAIWhisperProvider implements ASRProvider {
  name = "OpenAI Whisper";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
  }

  async transcribe({ buffer, fileName, mimeType, prompt, language = "en" }: TranscribeAudioOptions): Promise<ASRResult> {
    const startTime = Date.now();
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured.");

    let response: Response | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
        form.append("model", "whisper-1");
        form.append("language", language);
        if (prompt) form.append("prompt", prompt);

        response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}` },
          body: form,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 2) throw lastError;
      }
    }

    if (!response) throw new Error("OpenAI Whisper request did not return a response.");
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI Whisper transcription failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as { text?: string };

    return {
      rawTranscript: data.text || "",
      provider: "OpenAI",
      modelIdentifier: "whisper-1",
      executionDurationMs: Date.now() - startTime,
    };
  }
}

// 2. Deepgram Nova-3 Medical Provider
export class DeepgramMedicalProvider implements ASRProvider {
  name = "Deepgram Nova-3 Medical";
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || "";
  }

  async transcribe({ buffer, mimeType }: TranscribeAudioOptions): Promise<ASRResult> {
    const startTime = Date.now();
    if (!this.apiKey) {
      throw new Error("DEEPGRAM_API_KEY is not configured.");
    }

    const query = new URLSearchParams({
      model: "nova-3-medical",
      smart_format: "true",
      punctuate: "true",
    });

    const response = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Deepgram transcription failed: ${err}`);
    }

    const data = await response.json();
    const transcript =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return {
      rawTranscript: transcript,
      provider: "Deepgram",
      modelIdentifier: "deepgram-nova-3-medical",
      executionDurationMs: Date.now() - startTime,
    };
  }
}

// 3. Self-Hosted Faster-Whisper / Air-Gapped VPC Provider
export class FasterWhisperSelfHostedProvider implements ASRProvider {
  name = "Faster-Whisper (Self-Hosted)";
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.SELF_HOSTED_ASR_ENDPOINT || "http://localhost:8000/v1/audio/transcriptions";
  }

  async transcribe({ buffer, fileName, mimeType }: TranscribeAudioOptions): Promise<ASRResult> {
    const startTime = Date.now();

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("model", "large-v3");

    const response = await fetch(this.endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Self-hosted ASR inference failed: ${err}`);
    }

    const data = await response.json();

    return {
      rawTranscript: data.text || "",
      provider: "Self-Hosted",
      modelIdentifier: "faster-whisper-self-hosted",
      executionDurationMs: Date.now() - startTime,
    };
  }
}
