import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * RFP §22 Phase I MVP scope: doctor video script (5 durations), LinkedIn
 * article + short post, Facebook post, X post/thread, Reels/YouTube
 * description, SEO blog. organizationId: null means "global default" —
 * every org gets these unless they define their own overrides (see
 * ChannelDefinition.organizationId nullable FK + the OR filter in
 * lib/content-engine.ts's runAdaptationEngine).
 */
const DEFAULT_CHANNELS: Array<{
  channelKey: string;
  displayName: string;
  outputType:
    | "VIDEO_SCRIPT"
    | "LINKEDIN_ARTICLE"
    | "LINKEDIN_SHORT_POST"
    | "FACEBOOK_POST"
    | "X_POST"
    | "YOUTUBE_REELS_METADATA"
    | "SEO_BLOG";
  targetAudience: string;
  durationLabel?: string;
}> = [
  { channelKey: "VIDEO_SCRIPT_45S", displayName: "Video Script — 45s", outputType: "VIDEO_SCRIPT", targetAudience: "Mixed", durationLabel: "45 seconds" },
  { channelKey: "VIDEO_SCRIPT_60S", displayName: "Video Script — 60s", outputType: "VIDEO_SCRIPT", targetAudience: "Mixed", durationLabel: "60 seconds" },
  { channelKey: "VIDEO_SCRIPT_90S", displayName: "Video Script — 90s", outputType: "VIDEO_SCRIPT", targetAudience: "Mixed", durationLabel: "90 seconds" },
  { channelKey: "VIDEO_SCRIPT_2MIN", displayName: "Video Script — 2min", outputType: "VIDEO_SCRIPT", targetAudience: "Mixed", durationLabel: "2 minutes" },
  { channelKey: "VIDEO_SCRIPT_3MIN", displayName: "Video Script — 3min", outputType: "VIDEO_SCRIPT", targetAudience: "Mixed", durationLabel: "3 minutes" },
  { channelKey: "LINKEDIN_ARTICLE", displayName: "LinkedIn Article", outputType: "LINKEDIN_ARTICLE", targetAudience: "Professional" },
  { channelKey: "LINKEDIN_SHORT_POST", displayName: "LinkedIn Short Post", outputType: "LINKEDIN_SHORT_POST", targetAudience: "Professional" },
  { channelKey: "FACEBOOK_POST", displayName: "Facebook Post", outputType: "FACEBOOK_POST", targetAudience: "Patients & families" },
  { channelKey: "X_POST", displayName: "X / Twitter", outputType: "X_POST", targetAudience: "Mixed" },
  { channelKey: "YOUTUBE_REELS", displayName: "YouTube / Reels Metadata", outputType: "YOUTUBE_REELS_METADATA", targetAudience: "Mixed" },
  { channelKey: "SEO_BLOG", displayName: "SEO Blog Article", outputType: "SEO_BLOG", targetAudience: "Mixed" },
];

const DEFAULT_REDACTION_RULES = [
  { pattern: "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", flags: "gi", replacement: "[REDACTED_EMAIL]", description: "Redact email addresses." },
  { pattern: "(?<!\\d)(?:\\+?91[-\\s]?)?[6-9]\\d{9}(?!\\d)", flags: "g", replacement: "[REDACTED_PHONE]", description: "Redact Indian mobile numbers." },
  { pattern: "(?<!\\d)\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}(?!\\d)", flags: "g", replacement: "[REDACTED_AADHAAR]", description: "Redact Aadhaar numbers." },
  { pattern: "\\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar)\\s*[:#-]?\\s*[A-Z0-9-]{4,}\\b", flags: "gi", replacement: "[REDACTED_IDENTIFIER]", description: "Redact hospital and health identifiers." },
  { pattern: "\\b(?:date\\s+of\\s+birth|dob)\\s*[:#=-]?\\s*(?:\\d{1,2}[/-])?(?:\\d{1,2}[/-])\\d{2,4}\\b", flags: "gi", replacement: "[REDACTED_DOB]", description: "Redact labeled dates of birth and create a PII review marker." },
  { pattern: "(?<!\\d)(?:\\d{1,2}[/-])?(?:\\d{1,2}[/-])\\d{2,4}(?!\\d)", flags: "g", replacement: "[REDACTED_DATE]", description: "Redact standalone numeric dates." },
  { pattern: "\\b(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSON]", description: "Redact titled person names." },
  { pattern: "\\b(?:patient|pt|name|attendant|relative|address|phone|mobile|email)\\s*[:=-]\\s*[^,;\\n]+", flags: "gi", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact labeled personal information." },
];

async function main() {
  let created = 0;
  for (const channel of DEFAULT_CHANNELS) {
    const existing = await db.channelDefinition.findFirst({
      where: { channelKey: channel.channelKey, organizationId: null },
    });
    if (existing) continue;

    await db.channelDefinition.create({
      data: {
        channelKey: channel.channelKey,
        displayName: channel.displayName,
        outputType: channel.outputType,
        targetAudience: channel.targetAudience,
        durationLabel: channel.durationLabel,
        systemPrompt: "", // blank = fall back to lib/content-engine.ts DEFAULT_PROMPTS
        isActive: true,
        organizationId: null,
      },
    });
    created++;
  }
  let rulesCreated = 0;
  for (const rule of DEFAULT_REDACTION_RULES) {
    const patternOrCheck = JSON.stringify({ pattern: rule.pattern, flags: rule.flags, replacement: rule.replacement });
    const existing = await db.complianceRule.findFirst({ where: { ruleType: "DPDP_REDACTION", patternOrCheck, organizationId: null } });
    if (existing) continue;
    await db.complianceRule.create({ data: { ruleType: "DPDP_REDACTION", severity: "BLOCKER", patternOrCheck, description: rule.description, organizationId: null, isActive: true } });
    rulesCreated++;
  }
  console.log(`Seeded ${created} new default channel definitions and ${rulesCreated} redaction rules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
