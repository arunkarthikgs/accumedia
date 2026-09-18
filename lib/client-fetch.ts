"use client";

type CacheEntry = { promise: Promise<unknown>; expiresAt: number };

const requestCache = new Map<string, CacheEntry>();

export function clearJsonCache(urlPrefix?: string) {
  for (const key of requestCache.keys()) {
    if (!urlPrefix || key.endsWith(`:${urlPrefix}`) || key.includes(`:${urlPrefix}?`)) {
      requestCache.delete(key);
    }
  }
}

export function fetchJsonOnce<T>(url: string, init?: RequestInit, ttlMs = 1500): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") return fetch(url, init).then((response) => response.json() as Promise<T>);
  const key = `${method}:${url}`;
  const existing = requestCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.promise as Promise<T>;
  const promise = fetch(url, { ...init, credentials: init?.credentials || "same-origin" }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data as T;
  }).finally(() => {
    window.setTimeout(() => {
      const current = requestCache.get(key);
      if (current?.promise === promise) requestCache.delete(key);
    }, ttlMs);
  });
  requestCache.set(key, { promise, expiresAt: Date.now() + ttlMs });
  return promise;
}
