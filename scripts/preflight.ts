import { loadLocalEnvironment } from "./load-local-env";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const [{ checkRuntimeHealth }, { isRuntimeHealthy }] = await Promise.all([
    import("../src/lib/runtime-health"),
    import("../src/lib/types"),
  ]);
  const health = await checkRuntimeHealth(true);
  console.info(JSON.stringify(health, null, 2));
  process.exit(isRuntimeHealthy(health) ? 0 : 1);
}

void main();
