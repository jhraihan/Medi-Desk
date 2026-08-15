const looks = {
  primary:
    "inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700",
  secondary:
    "inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50",
  danger:
    "inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700",
};

export default function Button({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...rest
}) {
  return (
    <button type={type} className={looks[variant] + " " + className} {...rest}>
      {children}
    </button>
  );
}
