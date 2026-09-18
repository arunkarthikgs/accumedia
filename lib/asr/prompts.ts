import type { ASRModelIdentifier } from "./types";

type ASRPromptProfile = {
  agent: string;
  prompt: string | null;
  note: string;
};

export const DEFAULT_ASR_TRANSCRIPTION_PROMPT = "Clinical medical dictation from a licensed practitioner. Preserve exact wording, medication names, dosages, units, anatomy, abbreviations, and procedures. Do not summarize, infer, diagnose, or add information.";

export const ASR_PROMPT_PROFILES: Record<ASRModelIdentifier, ASRPromptProfile> = {
  "whisper-1": {
    agent: "OpenAI Whisper (whisper-1)",
    prompt: DEFAULT_ASR_TRANSCRIPTION_PROMPT,
    note: "Prompt guidance is sent to OpenAI Whisper with the audio.",
  },
  "deepgram-nova-3-medical": {
    agent: "Deepgram Nova-3 Medical (deepgram-nova-3-medical)",
    prompt: null,
    note: "Deepgram uses the Nova-3 Medical model and smart formatting; prompt text is not sent.",
  },
  "faster-whisper-self-hosted": {
    agent: "Faster-Whisper (faster-whisper-self-hosted)",
    prompt: null,
    note: "The self-hosted endpoint controls decoding; prompt text is not sent by this workflow.",
  },
  "aws-transcribe-medical": {
    agent: "AWS Transcribe Medical (aws-transcribe-medical)",
    prompt: null,
    note: "AWS Transcribe Medical does not use the Whisper prompt field.",
  },
};

export function getASRPromptProfile(modelId?: string): ASRPromptProfile {
  const model = (modelId || "whisper-1").trim().toLowerCase() as ASRModelIdentifier;
  return ASR_PROMPT_PROFILES[model] || ASR_PROMPT_PROFILES["whisper-1"];
}
