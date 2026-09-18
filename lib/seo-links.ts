type LinkKind = "internal" | "external";

export type SeoLinkCheck = {
  suggestion: string;
  url: string | null;
  status: "VALID" | "INVALID" | "UNRESOLVED";
  httpStatus: number | null;
  reason: string | null;
};

export type SeoLinkVerification = {
  internal: SeoLinkCheck[];
  external: SeoLinkCheck[];
  status: "PASS" | "PARTIAL" | "FAILED" | "UNRESOLVED";
  warnings: string[];
};

function suggestionValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["url", "href", "link", "target", "title"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return "";
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function resolveUrl(value: string, kind: LinkKind, websiteUrl?: string | null) {
  try {
    if (!websiteUrl && (value.startsWith("/") || !/^https?:\/\//i.test(value))) return null;
    const url = new URL(value, websiteUrl || undefined);
    if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return null;
    if (kind === "internal" && websiteUrl) {
      const base = new URL(websiteUrl);
      if (url.origin !== base.origin) return null;
    }
    if (kind === "external" && websiteUrl && url.origin === new URL(websiteUrl).origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function checkLink(suggestion: unknown, kind: LinkKind, websiteUrl?: string | null): Promise<SeoLinkCheck> {
  const raw = suggestionValue(suggestion);
  const url = resolveUrl(raw, kind, websiteUrl);
  if (!raw) return { suggestion: "", url: null, status: "INVALID", httpStatus: null, reason: "The suggestion has no URL or link target." };
  if (!url) {
    const reason = kind === "internal" && !websiteUrl
      ? "Configure the organization's website URL to resolve internal links."
      : "The URL is invalid, unsafe, or does not match the expected link scope.";
    return { suggestion: raw, url: null, status: websiteUrl ? "INVALID" : "UNRESOLVED", httpStatus: null, reason };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { Range: "bytes=0-0" } });
    }
    const valid = response.status >= 200 && response.status < 400;
    return { suggestion: raw, url, status: valid ? "VALID" : "INVALID", httpStatus: response.status, reason: valid ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { suggestion: raw, url, status: "INVALID", httpStatus: null, reason: error instanceof Error && error.name === "AbortError" ? "Request timed out." : "The URL could not be reached." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifySeoLinks(content: unknown, websiteUrl?: string | null): Promise<SeoLinkVerification> {
  const value = content && typeof content === "object" && !Array.isArray(content) ? content as Record<string, unknown> : {};
  const internalSuggestions = Array.isArray(value.internal_link_suggestions) ? value.internal_link_suggestions : Array.isArray(value.internalLinkSuggestions) ? value.internalLinkSuggestions : [];
  const externalSuggestions = Array.isArray(value.external_reference_suggestions) ? value.external_reference_suggestions : Array.isArray(value.externalReferenceSuggestions) ? value.externalReferenceSuggestions : [];
  const [internal, external] = await Promise.all([
    Promise.all(internalSuggestions.map((item) => checkLink(item, "internal", websiteUrl))),
    Promise.all(externalSuggestions.map((item) => checkLink(item, "external", websiteUrl))),
  ]);
  const checks = [...internal, ...external];
  const invalid = checks.filter((check) => check.status === "INVALID").length;
  const unresolved = checks.filter((check) => check.status === "UNRESOLVED").length;
  const warnings = checks.filter((check) => check.status !== "VALID").map((check) => `${check.suggestion || "SEO link"}: ${check.reason}`);
  const status = !checks.length || unresolved === checks.length ? "UNRESOLVED" : invalid === checks.length ? "FAILED" : invalid || unresolved ? "PARTIAL" : "PASS";
  return { internal, external, status, warnings };
}