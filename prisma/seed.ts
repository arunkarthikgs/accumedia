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
  { pattern: "\\b[A-Z0-9._%+-]+\\s+(?:at|@)\\s+[A-Z0-9.-]+\\.[A-Z]{2,}\\b", flags: "gi", replacement: "[REDACTED_EMAIL]", description: "Redact obfuscated email addresses written with 'at'." },
  { pattern: "(?<!\\d)(?:\\+?91[-\\s]?)?[6-9]\\d{9}(?!\\d)", flags: "g", replacement: "[REDACTED_PHONE]", description: "Redact Indian mobile numbers." },
  { pattern: "(?<!\\d)(?:\\+?91[-\\s]?)?[6-9]\\d{4}[-\\s]\\d{5}(?!\\d)", flags: "g", replacement: "[REDACTED_PHONE]", description: "Redact formatted Indian mobile numbers." },
  { pattern: "(?<!\\d)\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}(?!\\d)", flags: "g", replacement: "[REDACTED_AADHAAR]", description: "Redact Aadhaar numbers." },
  { pattern: "\\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar)\\s*[:#-]?\\s*[A-Z0-9-]{4,}\\b", flags: "gi", replacement: "[REDACTED_IDENTIFIER]", description: "Redact hospital and health identifiers." },
  { pattern: "\\b(?:ABHA|Aabha)\\s+(?:card\\s+)?(?:no\\.?|number)?\\s*(?:is|:|#|-)?\\s*(?:91[-\\s]?)?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b", flags: "gi", replacement: "[REDACTED_IDENTIFIER]", description: "Redact ABHA and Aabha card numbers, including country-code prefixes." },
  { pattern: "\\b(?:ABHA|Aabha)\\s+(?:health\\s+)?account\\s*(?:no\\.?|number)?\\s*(?:is|:|#|-)?\\s*(?:91[-\\s]?)?\\d{12,14}\\b", flags: "gi", replacement: "[REDACTED_IDENTIFIER]", description: "Redact ABHA and Aabha health-account numbers." },
  { pattern: "\\b(?:date\\s+of\\s+birth|dob)\\s*[:#=-]?\\s*(?:\\d{1,2}[/-])?(?:\\d{1,2}[/-])\\d{2,4}\\b", flags: "gi", replacement: "[REDACTED_DOB]", description: "Redact labeled dates of birth and create a PII review marker." },
  { pattern: "\\b(?:date\\s+of\\s+birth|dob|dobbed)\\s*[:#=-]?\\s*\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{2,4}\\b", flags: "gi", replacement: "[REDACTED_DOB]", description: "Redact labeled dates of birth written with a month name." },
  { pattern: "\\bborn\\s+on\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{2,4}\\b", flags: "gi", replacement: "[REDACTED_DOB]", description: "Redact dates of birth introduced by 'Born on'." },
  { pattern: "\\b(?:on|dated|date\\s+is)\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}\\b", flags: "gi", replacement: "[REDACTED_DATE]", description: "Redact complete day-month-year calendar dates." },
  { pattern: "(?<!\\d)(?:\\d{1,2}[/-])?(?:\\d{1,2}[/-])\\d{2,4}(?!\\d)", flags: "g", replacement: "[REDACTED_DATE]", description: "Redact standalone numeric dates." },
  { pattern: "\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{2,4})?)\\b", flags: "gi", replacement: "[REDACTED_DATE]", description: "Redact standalone calendar dates written with month names." },
  { pattern: "\\b(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSON]", description: "Redact titled person names." },
  { pattern: "\\b(?:we\\s+are\\s+admitting|admitted|patient\\s+name\\s+is)\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "gi", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact patient names introduced in admission or identification statements (corrected)." },
  { pattern: "\\b[Pp]atient\\s+is\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact patient names introduced by 'Patient is' without removing clinical statements." },
  { pattern: "\\b(?:husband|wife|mother|father|guardian|attendant|relative)\\s*,?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact named relatives and attendants." },
  { pattern: "\\b(?:[Hh]usband|[Ww]ife|[Mm]other|[Ff]ather|[Gg]uardian|[Aa]ttendant|[Rr]elative)\\s*,?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact capitalized or lowercase named relatives and attendants." },
  { pattern: "\\b(?:[Bb]rother|[Ss]ister|[Ss]on|[Dd]aughter)\\s*,?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact named siblings and children." },
  { pattern: "\\b(?:[Nn]ephew|[Nn]iece|[Cc]ousin)\\s*,?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact named nephews, nieces, and cousins." },
  { pattern: "\\b(?:signed\\s+by|consent\\s+signed\\s+by)\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b", flags: "gi", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact names associated with consent signatures (corrected)." },
  { pattern: "\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}\\s+has\\s+signed\\s+(?:the\\s+)?(?:emergency\\s+)?(?:high-risk\\s+)?consent\\b", flags: "g", replacement: "[REDACTED_PERSONAL_INFORMATION]", description: "Redact names that precede a consent-signature statement." },
  { pattern: "\\b(?:she|he|patient)\\s+(?:stays|lives|resides)\\s+(?:at|in)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact stated residential addresses." },
  { pattern: "\\bthey\\s+stay(?:\\s+over)?\\s+(?:at|in)?\\s*[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact shared household addresses." },
  { pattern: "\\b(?:residing|resides|lives|stays)\\s+(?:at|in)?\\s*(?:house|flat|plot|door|apartment)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact addresses introduced by a residence statement." },
  { pattern: "\\b(?:permanent|native|village)\\s+address\\s+(?:is|:)?\\s*[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact permanent and village address statements." },
  { pattern: "\\b(?:permanent|native|village)\\s+(?:village\\s+)?address\\s+(?:is|:)?[\\s\\S]{0,240}?\\b(?:pin\\s*code\\s*)?\\d{6}\\b", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact complete permanent or village addresses through the postal code." },
  { pattern: "\\b(?:he|she|patient)\\s+has\\s+been\\s+(?:staying|living|residing)[\\s\\S]{0,240}?\\b\\d{6}\\b", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact complete current-residence addresses through the postal code." },
  { pattern: "\\b(?:flat|house|plot|door|apartment)\\s*(?:no\\.?|number|#)?\\s*\\d+[A-Z-]*\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact residential unit addresses that continue after an address sentence." },
  { pattern: "\\b(?:\\d+(?:st|nd|rd|th)?\\s+block|house\\s+(?:no\\.?|number)?\\s*\\d+|\\d+(?:st|nd|rd|th)?\\s+cross|[A-Z][a-z]+\\s+\\d{6})\\b", flags: "g", replacement: "[REDACTED_ADDRESS]", description: "Redact address fragments that follow a residence statement." },
  { pattern: "\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2}\\s+\\d{6}\\b", flags: "g", replacement: "[REDACTED_ADDRESS]", description: "Redact locality and postal-code address fragments." },
  { pattern: "\\b\\d+(?:st|nd|rd|th)?\\s+block\\.\\s+house\\s+(?:no\\.?|number)?\\s*\\d+\\.\\s+\\d+(?:st|nd|rd|th)?\\s+cross\\.\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\s+\\d{6}\\b", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact block, house, cross, locality, and postal-code address sequences." },
  { pattern: "\\b(?:insurance|card|policy)\\s*(?:no\\.?|number|#)?\\s*[:=-]?\\s*[A-Z]{2,}[A-Z0-9-]{5,}\\b", flags: "gi", replacement: "[REDACTED_INSURANCE_IDENTIFIER]", description: "Redact insurance, policy, and membership card identifiers." },
  { pattern: "\\b(?:covered\\s+under|insured\\s+with)\\s+[^.!\\n]+(?:insurance|assurance)\\b", flags: "gi", replacement: "[REDACTED_INSURANCE_INFORMATION]", description: "Redact named patient insurance coverage." },
  { pattern: "\\bpatient\\s+is\\s+(?:a|an)?\\s*[^.!\\n]*(?:at|with|for)\\s+[A-Z][^.!\\n]+", flags: "gi", replacement: "[REDACTED_EMPLOYMENT_INFORMATION]", description: "Redact patient employment and employer details." },
  { pattern: "\\b(?:he|she|patient)\\s+is\\s+a\\s+retired\\s+[^.!\\n]+(?:from|at|with)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_EMPLOYMENT_INFORMATION]", description: "Redact retired patient role and employer details." },
  { pattern: "\\b(?:he|she)['’]s\\s+a\\s+retired\\s+[^.!\\n]+(?:from|at|with)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_EMPLOYMENT_INFORMATION]", description: "Redact contracted retired-patient role and employer details." },
  { pattern: "\\b(?:he|she|his\\s+wife|her\\s+husband|his\\s+mother|her\\s+mother|his\\s+father|her\\s+father)\\s+works\\s+(?:at|with|for|over\\s+in)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_EMPLOYMENT_INFORMATION]", description: "Redact relative employment and workplace-location details." },
  { pattern: "\\b(?:nephew|niece|brother|sister|son|daughter)\\s+(?:works|is\\s+employed)\\s+(?:at|with|for|over\\s+in)\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_EMPLOYMENT_INFORMATION]", description: "Redact named-relative employment and workplace details." },
  { pattern: "\\b(?:recording|referred|sent)\\s+(?:audio\\s+case\\s+summary\\s+)?(?:from|to)\\s+[A-Z][A-Za-z\\s-]{1,40}\\s+(?:OPD|clinic|hospital|centre|center)\\b", flags: "g", replacement: "[REDACTED_FACILITY]", description: "Redact named care-facility references in case handoff metadata." },
  { pattern: "\\b[A-Z][A-Za-z-]{2,}(?:\\s+[A-Z][A-Za-z-]{2,}){0,3}\\s+(?:OPD|clinic|hospital|centre|center)\\b", flags: "g", replacement: "[REDACTED_FACILITY]", description: "Redact named care-facility references." },
  { pattern: "\\b(?:corporate|registered)\\s+office\\s+[^.!\\n]+", flags: "gi", replacement: "[REDACTED_ADDRESS]", description: "Redact employer office locations." },
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
