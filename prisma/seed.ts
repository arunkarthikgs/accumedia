import { PrismaClient } from "@prisma/client";
import { DEFAULT_CLINICAL_REFINER_PROMPT } from "../lib/clinical-refiner";
import { DEFAULT_IMAGE_GENERATION_PROMPT, DEFAULT_IMAGE_SAFETY_PROMPT } from "../lib/image-prompts";
import { MANDATORY_CLINICAL_SYNTHESIS_PROMPT } from "../lib/prompts/clinical-synthesis";
import { DEFAULT_SEO_KEYWORD_PROMPT } from "../lib/seo-keyword-engine";

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

const ROLE_PERMISSIONS = [
  ["CASE_VIEW", "View clinical cases", "Clinical", "View cases and case status."],
  ["CASE_CREATE", "Create clinical cases", "Clinical", "Create new case submissions."],
  ["MCCR_EDIT", "Edit Master Clinical Records", "Clinical", "Edit structured clinical records."],
  ["MCCR_APPROVE", "Approve Master Clinical Records", "Clinical", "Sign off approved clinical records."],
  ["SAFETY_QUEUE_MANAGE", "Manage Safety Queue", "Compliance", "Review and resolve safety flags."],
  ["PROMPT_MANAGE", "Manage AI prompts", "Governance", "Edit versioned clinical and AI prompts."],
  ["ASSET_GENERATE", "Generate publishing assets", "Publishing", "Generate platform-specific assets."],
  ["ASSET_VIEW", "View publishing assets", "Publishing", "View generated assets and image review state."],
  ["ASSET_APPROVE", "Approve publishing assets", "Publishing", "Approve or edit individual assets."],
  ["PUBLISH_MANAGE", "Manage publishing", "Publishing", "Connect platforms and queue publication."],
  ["SEO_MANAGE", "Manage SEO keywords", "SEO", "Review keyword sets and SEO quality."],
  ["USAGE_VIEW", "View AI usage and quotas", "Administration", "View usage, costs, and quota consumption."],
  ["ROLE_MATRIX_MANAGE", "Manage role matrix", "Administration", "Assign task permissions to roles."],
] as const;

const ROLE_DEFINITIONS = [
  { slug: "platform-admin", name: "Platform Administrator", description: "Global platform, tenant, role, and compliance administration.", system: true, permissions: ROLE_PERMISSIONS.map(([slug]) => slug) },
  { slug: "organization-admin", name: "Organization Administrator", description: "Manage every feature within one hospital network and its users and configuration.", system: false, permissions: ROLE_PERMISSIONS.map(([slug]) => slug) },
  { slug: "attending-rmp", name: "Attending RMP", description: "Clinical submission, review, and Master Clinical Record sign-off.", system: false, permissions: ["CASE_VIEW", "CASE_CREATE", "MCCR_EDIT", "MCCR_APPROVE", "ASSET_VIEW"] },
  { slug: "compliance-officer", name: "Compliance Officer", description: "DPDP, NMC, safety review, prompt, and audit governance.", system: false, permissions: ["CASE_VIEW", "SAFETY_QUEUE_MANAGE", "PROMPT_MANAGE", "USAGE_VIEW", "ROLE_MATRIX_MANAGE"] },
  { slug: "publishing-editor", name: "Publishing & SEO Editor", description: "Asset editing, approval, SEO, and publishing workflows.", system: false, permissions: ["CASE_VIEW", "ASSET_GENERATE", "ASSET_APPROVE", "PUBLISH_MANAGE", "SEO_MANAGE"] },
  { slug: "auditor", name: "Auditor", description: "Read-only governance, safety, usage, and version history access.", system: false, permissions: ["CASE_VIEW", "USAGE_VIEW"] },
] as const;

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
  const permissions = new Map<string, string>();
  for (const [slug, name, module, description] of ROLE_PERMISSIONS) {
    const taskDefinition = await db.taskDefinition.upsert({
      where: { slug },
      update: { name, module, description },
      create: { slug, name, module, description },
    });
    const permission = await db.permission.upsert({ where: { slug }, update: { name, module, description, taskDefinitionId: taskDefinition.id }, create: { slug, name, module, description, taskDefinitionId: taskDefinition.id } });
    permissions.set(slug, permission.id);
  }
  const organizationsForRoles = await db.organization.findMany({ select: { id: true } });
  for (const definition of ROLE_DEFINITIONS) {
    const masterDefinition = await db.roleDefinition.upsert({
      where: { slug: definition.slug },
      update: { name: definition.name, description: definition.description, isSystem: definition.system },
      create: { slug: definition.slug, name: definition.name, description: definition.description, isSystem: definition.system },
    });
    for (const permissionSlug of definition.permissions) {
      const permissionId = permissions.get(permissionSlug);
      if (permissionId) await db.roleDefinitionPermission.upsert({ where: { roleDefinitionId_permissionId: { roleDefinitionId: masterDefinition.id, permissionId } }, update: {}, create: { roleDefinitionId: masterDefinition.id, permissionId } });
    }
    const scopes = definition.system ? [null] : organizationsForRoles.map((organization) => organization.id);
    for (const organizationId of scopes) {
      let role = await db.role.findFirst({ where: { slug: definition.slug, organizationId } });
      role = role ? await db.role.update({ where: { id: role.id }, data: { name: definition.name, description: definition.description, isSystem: definition.system, definitionId: masterDefinition.id } }) : await db.role.create({ data: { slug: definition.slug, name: definition.name, description: definition.description, isSystem: definition.system, definitionId: masterDefinition.id, organizationId } });
      for (const permissionSlug of definition.permissions) {
        const permissionId = permissions.get(permissionSlug);
        if (permissionId) await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId } }, update: {}, create: { roleId: role.id, permissionId } });
      }
    }
  }
  const masterPrompts = [
    ["MASTER_SYNTHESIS", MANDATORY_CLINICAL_SYNTHESIS_PROMPT],
    ["SEO_KEYWORDS", DEFAULT_SEO_KEYWORD_PROMPT],
    ["CLINICAL_REFINER", DEFAULT_CLINICAL_REFINER_PROMPT],
    ["IMAGE_GENERATION", DEFAULT_IMAGE_GENERATION_PROMPT],
    ["IMAGE_SAFETY", DEFAULT_IMAGE_SAFETY_PROMPT],
  ] as const;
  const promptDefinitionsCatalog: Record<(typeof masterPrompts)[number][0], { name: string; description: string }> = {
    MASTER_SYNTHESIS: { name: "Master Clinical Synthesis", description: "Generates the governed Master Clinical Record from sanitized clinical inputs." },
    SEO_KEYWORDS: { name: "SEO Keyword Generation", description: "Generates and validates the SEO keyword set for approved clinical content." },
    CLINICAL_REFINER: { name: "Clinical Transcript Refinement", description: "Refines sanitized ASR output into accurate clinical documentation without adding facts." },
    IMAGE_GENERATION: { name: "Clinical Image Generation", description: "Creates educational clinical imagery for approved publishing channels." },
    IMAGE_SAFETY: { name: "Clinical Image Safety", description: "Screens generated or uploaded clinical imagery for privacy, safety, and public-use risks." },
  };
  const promptDefinitions = new Map<string, string>();
  for (const [promptKey] of masterPrompts) {
    const catalogEntry = promptDefinitionsCatalog[promptKey];
    const definition = await db.aiPromptDefinition.upsert({
      where: { promptKey },
      update: { name: catalogEntry.name, description: catalogEntry.description, isSystem: true },
      create: { promptKey, name: catalogEntry.name, description: catalogEntry.description, isSystem: true },
    });
    promptDefinitions.set(promptKey, definition.id);
  }
  let masterPromptsCreated = 0;
  for (const [promptKey, content] of masterPrompts) {
    const definitionId = promptDefinitions.get(promptKey);
    const existing = await db.aiPromptTemplate.findFirst({ where: { organizationId: null, promptKey }, orderBy: { version: "desc" } });
    if (!existing) {
      await db.aiPromptTemplate.create({ data: { organizationId: null, promptKey, definitionId, content, version: 1, isActive: true } });
      masterPromptsCreated++;
    } else {
      await db.aiPromptTemplate.update({ where: { id: existing.id }, data: { definitionId, isActive: existing.content === content ? true : existing.isActive } });
    }
  }

  const organizations = await db.organization.findMany({ select: { id: true, clinicalRefinerPrompt: true } });
  for (const organization of organizations) {
    for (const [promptKey, masterContent] of masterPrompts) {
      const master = await db.aiPromptTemplate.findFirst({ where: { organizationId: null, promptKey }, orderBy: { version: "desc" } });
      if (!master) continue;
      const activeOverrides = await db.aiPromptTemplate.findMany({ where: { organizationId: organization.id, promptKey, isActive: true }, orderBy: { version: "desc" } });
      const preferredContent = promptKey === "CLINICAL_REFINER" && organization.clinicalRefinerPrompt?.trim()
        ? organization.clinicalRefinerPrompt.trim()
        : activeOverrides[0]?.content;
      if (!preferredContent || preferredContent === masterContent) {
        if (activeOverrides.length) await db.aiPromptTemplate.updateMany({ where: { id: { in: activeOverrides.map((prompt) => prompt.id) } }, data: { isActive: false } });
        continue;
      }
      const current = activeOverrides[0];
      if (current && current.content === preferredContent) {
        if (activeOverrides.length > 1) await db.aiPromptTemplate.updateMany({ where: { id: { in: activeOverrides.slice(1).map((prompt) => prompt.id) } }, data: { isActive: false } });
        continue;
      }
      if (activeOverrides.length) await db.aiPromptTemplate.updateMany({ where: { id: { in: activeOverrides.map((prompt) => prompt.id) } }, data: { isActive: false } });
      await db.aiPromptTemplate.create({ data: { organizationId: organization.id, promptKey, definitionId: promptDefinitions.get(promptKey), content: preferredContent, version: (current?.version || master.version) + 1, isActive: true } });
    }
  }
  console.log(`Seeded ${created} channels, ${rulesCreated} redaction rules, and ${masterPromptsCreated} master AI prompt templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
