const REDACTION_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]", "Redact email addresses."],
  [/\b[A-Z0-9._%+-]+\s+(?:at|@)\s+[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]", "Redact obfuscated email addresses."],
  [/\b(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}|[A-Z]{2}-\d{1,2}-[A-Z]{1,3}-\d{4})\b/gi, "[REDACTED_VEHICLE]", "Redact vehicle registration numbers."],
  [/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{4}[-\s]?\d{5}(?!\d)/g, "[REDACTED_PHONE]", "Redact Indian mobile numbers."],
  [/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, "[REDACTED_AADHAAR]", "Redact Aadhaar numbers."],
  [/\b[a-z0-9._-]{4,}@(abdm|sbx|ndhm)\b/gi, "[REDACTED_ABHA]", "Redact ABHA addresses."],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[REDACTED_PAN]", "Redact PAN identifiers."],
  [/\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar|patient\s*id)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_IDENTIFIER]", "Redact hospital and health identifiers."],
  [/\b(?:date\s+of\s+birth|dob)\s*[:#=-]?\s*(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}\b/gi, "[REDACTED_DOB]", "Redact dates of birth."],
  [/(?<!\d)(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}(?!\d)/g, "[REDACTED_DATE]", "Redact numeric calendar dates."],
  [/\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "[REDACTED_PERSON]", "Redact titled person names."],
  [/(?<!\d)\b(?:\d{1,2})(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}\b/gi, "[REDACTED_DATE]", "Redact written calendar dates."],
  [/\b(?:patient|pt|name|attendant|relative|address|phone|mobile|email)\s*[:=-]\s*[^,;\n]+/gi, "[REDACTED_PERSONAL_INFORMATION]", "Redact labeled personal information."],
];

type DatabaseRedactionRule = {
  patternOrCheck: string;
  description?: string;
};

type ParsedRedactionRule = {
  pattern: RegExp;
  replacement: string;
  description: string;
  priority: number;
};

function databasePatterns(rules: DatabaseRedactionRule[]): ParsedRedactionRule[] {
  return rules.flatMap((rule) => {
    try {
      const definition = JSON.parse(rule.patternOrCheck) as { pattern?: string; flags?: string; replacement?: string };
      if (!definition.pattern || !definition.replacement) return [];
      return [{
        pattern: new RegExp(definition.pattern, definition.flags || "gi"),
        replacement: definition.replacement,
        description: rule.description || "Configured redaction rule",
        priority: 100,
      }];
    } catch {
      return [];
    }
  });
}

function allPatterns(rules: DatabaseRedactionRule[] = []): ParsedRedactionRule[] {
  return [
    ...REDACTION_PATTERNS.map(([pattern, replacement, description], index) => ({ pattern, replacement, description, priority: 200 - index })),
    ...databasePatterns(rules),
  ];
}

type RedactionMatch = ParsedRedactionRule & { start: number; end: number };

function collectMatches(value: string, rules: DatabaseRedactionRule[] = []): RedactionMatch[] {
  const matches: RedactionMatch[] = [];
  for (const rule of allPatterns(rules)) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const pattern = new RegExp(rule.pattern.source, flags);
    for (const match of value.matchAll(pattern)) {
      const start = match.index ?? 0;
      matches.push({ ...rule, start, end: start + match[0].length });
    }
  }
  return matches;
}

function selectedMatches(value: string, rules: DatabaseRedactionRule[] = []): RedactionMatch[] {
  const selected: RedactionMatch[] = [];
  for (const candidate of collectMatches(value, rules).sort((left, right) => right.priority - left.priority || (right.end - right.start) - (left.end - left.start) || left.start - right.start)) {
    if (!selected.some((chosen) => candidate.start < chosen.end && candidate.end > chosen.start)) {
      selected.push(candidate);
    }
  }
  return selected;
}

export function redactClinicalText(value: string, rules?: DatabaseRedactionRule[]): string {
  const matches = selectedMatches(value, rules);
  return matches.sort((left, right) => right.start - left.start).reduce((text, match) => text.slice(0, match.start) + match.replacement + text.slice(match.end), value);
}

export function findUnredactedRuleMatches(value: string, rules: DatabaseRedactionRule[] = []): string[] {
  return Array.from(new Set(collectMatches(value, rules).map((match) => match.description)));
}

export function redactClinicalValue<T>(value: T, rules?: DatabaseRedactionRule[]): T {
  if (typeof value === "string") return redactClinicalText(value, rules) as T;
  if (Array.isArray(value)) return value.map((item) => redactClinicalValue(item, rules)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactClinicalValue(item, rules)])
    ) as T;
  }
  return value;
}
