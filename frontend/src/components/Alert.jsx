import { CheckCircle2, RotateCw, TriangleAlert } from "lucide-react";

// onRetry adds a "Try again" button, for a page whose data failed to load.
export default function Alert({ children, variant = "danger", onRetry }) {
  if (!children) return null;

  const success = variant === "success";
  const styles = success
    ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
    : "border-rose-200/80 bg-rose-50/80 text-rose-800";
  const Icon = success ? CheckCircle2 : TriangleAlert;

  return (
    <div
      role={success ? "status" : "alert"}
      className={`animate-fade mb-4 flex items-start gap-2.5 rounded-xl border p-3 text-sm font-medium backdrop-blur ${styles}`}
    >
      <Icon size={17} className="mt-px shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-rose-500"
        >
          <RotateCw size={12} /> Try again
        </button>
      )}
    </div>
  );
}
