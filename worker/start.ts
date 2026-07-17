import { loadLocalEnvironment } from "../scripts/load-local-env";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const [{ checkRuntimeHealth }, { isRuntimeHealthy }] = await Promise.all([
    import("../src/lib/runtime-health"),
    import("../src/lib/types"),
  ]);
  const health = await checkRuntimeHealth(true);
  if (!isRuntimeHealthy(health)) {
    const failed = Object.entries(health)
      .filter(([key, status]) => !["mode", "web"].includes(key) && status !== "ok")
      .map(([key, status]) => `${key}=${status}`)
      .join(", ");
    throw new Error(`Worker preflight failed: ${failed}`);
  }
  await import("./index");
}

void main();
