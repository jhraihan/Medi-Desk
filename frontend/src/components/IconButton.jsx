const looks = {
  plain: "text-ink-500 hover:bg-brand-50 hover:text-ink-900",
  danger: "text-rose-600 hover:bg-rose-50",
};

// An icon alone tells a screen reader nothing, so every icon button needs a label.
export default function IconButton({
  variant = "plain",
  type = "button",
  label,
  className = "",
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 ${looks[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
