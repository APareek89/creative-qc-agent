import { CircleCheck, CircleDashed, CircleX, Clock3, PackageCheck, ScanLine, Sparkles } from "lucide-react";
import type { AssetStatus, BatchStatus } from "@/lib/types";

const labels: Record<AssetStatus | BatchStatus, string> = {
  draft: "Draft",
  calibrating: "Calibrating",
  synthesizing: "Synthesizing",
  ready: "Ready",
  autonomous_running: "Agents working",
  done: "Complete",
  queued: "Queued",
  generating: "Generating",
  qc: "Vision QC",
  passed: "Passed",
  failed: "Failed",
  needs_review: "Needs review",
  approved: "Approved",
  delivered: "Delivered",
};

export function StatusChip({ status, compact = false }: { status: AssetStatus | BatchStatus; compact?: boolean }) {
  const Icon = status === "passed" || status === "approved" || status === "done"
    ? CircleCheck
    : status === "delivered"
      ? PackageCheck
      : status === "failed"
        ? CircleX
        : status === "needs_review"
          ? Clock3
          : status === "generating" || status === "autonomous_running" || status === "synthesizing"
            ? Sparkles
            : status === "qc"
              ? ScanLine
              : CircleDashed;
  return (
    <span className={`status-chip status-${status} ${compact ? "status-compact" : ""}`}>
      <Icon size={compact ? 12 : 13} strokeWidth={2.2} />
      {labels[status]}
    </span>
  );
}
