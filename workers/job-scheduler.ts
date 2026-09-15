export interface Env {
  APP_URL: string;
  PUBLISHING_CRON_SECRET: string;
}

interface SchedulerContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function trigger(env: Env, path: string) {
  const response = await fetch(new URL(path, env.APP_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishing-cron-secret": env.PUBLISHING_CRON_SECRET,
    },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}

export default {
  async scheduled(_event: unknown, env: Env, context: SchedulerContext) {
    context.waitUntil((async () => {
      await Promise.all([
        trigger(env, "/api/image-jobs/process"),
        trigger(env, "/api/admin/publishing/process"),
      ]);
    })());
  },
};
