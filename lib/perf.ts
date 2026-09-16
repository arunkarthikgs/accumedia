export async function timeDbOperation<T>(label: string, operation: () => Promise<T>) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= 250) console.warn(`[db] ${label} ${durationMs}ms`);
  }
}
