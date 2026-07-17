import { NextResponse } from "next/server";
import { checkRuntimeHealth } from "@/lib/runtime-health";
import type { RuntimeHealth } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<RuntimeHealth>> {
  return NextResponse.json(await checkRuntimeHealth());
}
