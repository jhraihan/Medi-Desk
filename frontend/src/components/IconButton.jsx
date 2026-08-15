const looks = {
  plain: "rounded-md p-2 text-slate-600 hover:bg-slate-100",
  danger: "rounded-md p-2 text-red-600 hover:bg-red-50",
};

export default function IconButton({
  variant = "plain",
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
