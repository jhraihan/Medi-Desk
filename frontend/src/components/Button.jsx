import { LoaderCircle } from "lucide-react";

const looks = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-[0.98]",
  secondary:
    "border border-brand-200/70 bg-white/80 text-ink-700 backdrop-blur hover:border-brand-300 hover:bg-white active:scale-[0.98]",
  ghost:
    "text-brand-700 hover:bg-brand-50 active:scale-[0.98]",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:scale-[0.98]",
  "danger-ghost":
    "text-rose-600 hover:bg-rose-50 active:scale-[0.98]",
  success:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]",
};

const sizes = {
  md: "gap-2 rounded-xl px-4 py-2 text-sm",
  sm: "gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
};

// busy shows a spinner and blocks further clicks, so a slow request can't be sent twice.
export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  busy = false,
  disabled,
  className = "",
  children,
  ...rest
}) {
  const base =
    "inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${base} ${sizes[size]} ${looks[variant]} ${className}`}
      {...rest}
    >
      {busy && <LoaderCircle size={size === "sm" ? 12 : 15} className="animate-spin" />}
      {children}
    </button>
  );
}
