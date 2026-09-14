export type ASRModelIdentifier =
  | "whisper-1"
  | "deepgram-nova-3-medical"
  | "faster-whisper-self-hosted"
  | "aws-transcribe-medical";

export interface TranscribeAudioOptions {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  prompt?: string;
  language?: string;
}

export interface ASRResult {
  rawTranscript: string;
  provider: string;
  modelIdentifier: ASRModelIdentifier | string;
  executionDurationMs: number;
}

export interface ASRProvider {
  name: string;
  transcribe(options: TranscribeAudioOptions): Promise<ASRResult>;
}
