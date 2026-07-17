import { existsSync } from "node:fs";
import path from "node:path";

export function loadLocalEnvironment(): void {
  for (const filename of [".env.local", ".env"]) {
    const filePath = path.join(process.cwd(), filename);
    if (existsSync(filePath)) process.loadEnvFile(filePath);
  }
}
