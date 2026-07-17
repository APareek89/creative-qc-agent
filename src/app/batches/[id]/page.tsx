import { BatchBoard } from "@/components/batch-board";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BatchBoard batchId={id} />;
}
