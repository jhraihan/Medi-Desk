const looks = {
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:scale-[0.98]",
  secondary:
    "border border-white/70 bg-white/70 text-ink-700 backdrop-blur hover:bg-white active:scale-[0.98]",
  ghost:
    "text-brand-700 hover:bg-brand-50 active:scale-[0.98]",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:scale-[0.98]",
};

export default function Button({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-60 disabled:active:scale-100";

  return (
    <button type={type} className={`${base} ${looks[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
