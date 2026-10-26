export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // On Vercel/serverless, Inngest drives the pipeline. Locally (or on a
  // long-running Node host) run it in-process unless explicitly disabled.
  if (process.env.VERCEL || process.env.LOCAL_SCHEDULER === "off") return;
  const { startLocalScheduler } = await import("./lib/sync/local-scheduler");
  startLocalScheduler();
}
