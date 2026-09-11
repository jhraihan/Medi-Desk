export default function Alert({ children, variant = "danger" }) {
  if (!children) return null;

  const styles =
    variant === "success"
      ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
      : "border-rose-200/80 bg-rose-50/80 text-rose-800";

  return (
    <div className={`animate-fade mb-4 rounded-xl border p-3 text-sm font-medium backdrop-blur ${styles}`}>
      {children}
    </div>
  );
}
