export default function Alert({ children, variant = "danger" }) {
  if (!children) return null;
  const styles =
    variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`mb-4 rounded-md border p-3 text-sm font-medium ${styles}`}>
      {children}
    </div>
  );
}
