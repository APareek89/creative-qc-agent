import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isDemoMode } from "@/lib/env";
import { enqueueJob } from "@/lib/queue";
import { getRepository } from "@/lib/repository";
import { approvalSchema } from "@/lib/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = approvalSchema.parse(await request.json());
    const result = await getRepository().addApproval(id, input);
    if (result.approvedCount >= 5 && !isDemoMode) {
      await getRepository().setBatchStatus(id, "synthesizing");
      try {
        await enqueueJob({ kind: "synthesize_recipe", batchId: id }, `synthesis-${id}`);
      } catch (error) {
        await getRepository().setBatchStatus(id, "calibrating");
        throw error;
      }
    }
    const batch = await getRepository().getBatch(id);
    return NextResponse.json({ ...result, batch });
  } catch (error) {
    return apiError(error, "Could not record the calibration decision.");
  }
}
