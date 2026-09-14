import OpenAI, { toFile } from "openai";
import { ASRProvider, TranscribeAudioOptions, ASRResult } from "./types";

// 1. OpenAI Whisper Provider
export class OpenAIWhisperProvider implements ASRProvider {
  name = "OpenAI Whisper";
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async transcribe({ buffer, fileName, mimeType, prompt, language = "en" }: TranscribeAudioOptions): Promise<ASRResult> {
    const startTime = Date.now();
    const file = await toFile(buffer, fileName, { type: mimeType });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language,
      prompt: prompt || "Clinical medical consultation, pharmacology, and anatomy.",
    });

    return {
      rawTranscript: response.text || "",
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
      body: buffer,
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
    const blob = new Blob([buffer], { type: mimeType });
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
