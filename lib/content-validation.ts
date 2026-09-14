import type { ChannelDefinition } from "@prisma/client";

export type ContentValidation = {
  valid: boolean;
  warnings: string[];
  wordCount: number;
  characterCount: number;
  estimatedDurationSeconds?: number;
};

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(contentText).join(" ");
  if (content && typeof content === "object") return Object.values(content).map(contentText).join(" ");
  return "";
}

export function validateGeneratedContent(
  content: unknown,
  channel: Pick<ChannelDefinition, "wordCountMin" | "wordCountMax" | "durationLabel" | "outputType">,
): ContentValidation {
  const text = contentText(content).trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const characterCount = text.length;
  const warnings: string[] = [];

  if (!text) warnings.push("Generated content is empty.");
  if (channel.wordCountMin && wordCount < channel.wordCountMin) warnings.push(`Content is below the minimum of ${channel.wordCountMin} words.`);
  if (channel.wordCountMax && wordCount > channel.wordCountMax) warnings.push(`Content exceeds the maximum of ${channel.wordCountMax} words.`);
  const durationMatch = channel.durationLabel?.match(/(\d+)\s*(?:s|sec|min|m)/i);
  if (channel.outputType === "VIDEO_SCRIPT" && durationMatch) {
      const targetSeconds = /min|m/i.test(durationMatch[0]) ? Number(durationMatch[1]) * 60 : Number(durationMatch[1]);
      const estimatedDurationSeconds = Math.round((wordCount / 130) * 60);
      if (Math.abs(estimatedDurationSeconds - targetSeconds) > 15) {
        warnings.push(`Estimated script duration is ${estimatedDurationSeconds}s; target is ${targetSeconds}s.`);
      }
      return { valid: warnings.length === 0, warnings, wordCount, characterCount, estimatedDurationSeconds };
    }

    return { valid: warnings.length === 0, warnings, wordCount, characterCount };
}
