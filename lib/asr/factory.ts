import { ASRProvider, ASRModelIdentifier } from "./types";
import {
  OpenAIWhisperProvider,
  DeepgramMedicalProvider,
  FasterWhisperSelfHostedProvider,
} from "./providers";

export function getASRProvider(modelId?: ASRModelIdentifier | string): ASRProvider {
  const target = (modelId || process.env.DEFAULT_ASR_MODEL || "whisper-1").trim().toLowerCase();

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
