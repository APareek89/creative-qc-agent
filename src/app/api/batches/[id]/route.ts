import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const batch = await getRepository().getBatch(id);
    if (!batch) throw new Error("Batch not found.");
    return NextResponse.json(batch);
  } catch (error) {
    return apiError(error, "Could not load the batch.");
  }
}
