import { ASRProvider, ASRModelIdentifier } from "./types";
import {
  OpenAIWhisperProvider,
  DeepgramMedicalProvider,
  FasterWhisperSelfHostedProvider,
} from "./providers";

export function getASRProvider(modelId?: ASRModelIdentifier | string): ASRProvider {
  const target = (modelId || process.env.DEFAULT_ASR_MODEL || "whisper-1").trim().toLowerCase();
  const externalAsrAllowed = process.env.ALLOW_EXTERNAL_ASR === "true";
  const isExternalModel = ["whisper-1", "openai", "deepgram", "deepgram-nova-3-medical"].includes(target);
  if (process.env.NODE_ENV === "production" && isExternalModel && !externalAsrAllowed) {
    throw new Error("External ASR is disabled in production. Use faster-whisper-self-hosted or explicitly set ALLOW_EXTERNAL_ASR=true after privacy approval.");
  }

  switch (target) {
    case "deepgram-nova-3-medical":
    case "deepgram":
      return new DeepgramMedicalProvider();

    case "faster-whisper-self-hosted":
    case "self-hosted":
      return new FasterWhisperSelfHostedProvider();

    case "whisper-1":
    case "openai":
    default:
      return new OpenAIWhisperProvider();
  }
}
