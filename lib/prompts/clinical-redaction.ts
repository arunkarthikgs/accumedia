const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  [/(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]"],
  [/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, "[REDACTED_AADHAAR]"],
  [/\b(?:UHID|MRN|IPD|OPD|ABHA|Aadhaar)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_IDENTIFIER]"],
  [/(?<!\d)(?:\d{1,2}[/-])?(?:\d{1,2}[/-])\d{2,4}(?!\d)/g, "[REDACTED_DATE]"],
  [/\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g, "[REDACTED_PERSON]"],
  [/(?<!\d)\b(?:\d{1,2})(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4}\b/gi, "[REDACTED_DATE]"],
  [/\b(?:patient|pt|name|attendant|relative|address|phone|mobile|email)\s*[:=-]\s*[^,;\n]+/gi, "[REDACTED_PERSONAL_INFORMATION]"],
];

export function redactClinicalText(value: string): string {
  return REDACTION_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function redactClinicalValue<T>(value: T): T {
  if (typeof value === "string") return redactClinicalText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactClinicalValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactClinicalValue(item)])
    ) as T;
  }
  return value;
}
