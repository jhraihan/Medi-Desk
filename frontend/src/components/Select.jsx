import { FieldLabel } from "./Input.jsx";
import { hintText, inputBox } from "./styles.js";

export default function Select({
  label,
  hint,
  placeholder,
  children,
  className = "",
  ...rest
}) {
  return (
    <label className="block">
      <FieldLabel label={label} required={rest.required} />
      <select className={`${inputBox} ${className}`} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {hint && <span className={hintText}>{hint}</span>}
    </label>
  );
}
