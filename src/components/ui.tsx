import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";

export function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <AlertTriangle size={24} />
      <div><strong>Something needs attention</strong><p>{message}</p></div>
      {onRetry && <button type="button" className="button secondary small" onClick={onRetry}><RotateCcw size={15} /> Retry</button>}
    </div>
  );
}

export function ProgressBar({ value, tone = "purple" }: { value: number; tone?: "purple" | "green" | "amber" }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className={`progress-track progress-${tone}`}><span style={{ width: `${safe}%` }} /></div>;
}
