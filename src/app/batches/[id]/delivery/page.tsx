import { DeliveryScreen } from "@/components/delivery-screen";

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DeliveryScreen batchId={id} />;
}
