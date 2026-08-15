import { inputBox, labelText } from "./styles.js";

export default function Select({
  label,
  placeholder,
  children,
  className = "",
  ...rest
}) {
  return (
    <label className="block">
      {label && <span className={labelText}>{label}</span>}
      <select className={`${inputBox} ${className}`} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
    </label>
  );
}
