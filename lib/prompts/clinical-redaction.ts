const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  [/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]"],
  [/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, "[REDACTED_AADHAAR]"],
  [/\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_IDENTIFIER]"],
  [/\b(?:date\s+of\s+birth|dob)\s*[:#=-]?\s*(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}\b/gi, "[REDACTED_DOB]"],
  [/(?<!\d)(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}(?!\d)/g, "[REDACTED_DATE]"],
  [/\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "[REDACTED_PERSON]"],
  [/(?<!\d)\b(?:\d{1,2})(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}\b/gi, "[REDACTED_DATE]"],
  [/\b(?:patient|pt|name|attendant|relative|address|phone|mobile|email)\s*[:=-]\s*[^,;\n]+/gi, "[REDACTED_PERSONAL_INFORMATION]"],
];

type DatabaseRedactionRule = {
  patternOrCheck: string;
  description?: string;
};

type ParsedRedactionRule = {
  pattern: RegExp;
  replacement: string;
  description: string;
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
      }];
    } catch {
      return [];
    }
  }).sort((left, right) => right.pattern.source.length - left.pattern.source.length);
}

export function redactClinicalText(value: string, rules?: DatabaseRedactionRule[]): string {
  const patterns = rules && rules.length > 0
    ? databasePatterns(rules)
    : REDACTION_PATTERNS.map(([pattern, replacement]) => ({ pattern, replacement, description: "Built-in redaction rule" }));
  return patterns.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), value);
}

export function findUnredactedRuleMatches(value: string, rules: DatabaseRedactionRule[]): string[] {
  if (rules.length === 0) return ["No active database redaction rules are configured."];
  return databasePatterns(rules).flatMap((rule) => {
    rule.pattern.lastIndex = 0;
    return rule.pattern.test(value) ? [rule.description] : [];
  });
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
