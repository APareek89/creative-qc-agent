import { CalibrationScreen } from "@/components/calibration-screen";

export default async function CalibrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CalibrationScreen batchId={id} />;
}
