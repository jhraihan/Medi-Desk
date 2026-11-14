import { FieldLabel } from "./Input.jsx";
import { hintText, inputBox } from "./styles.js";

export default function Textarea({ label, hint, className = "", rows = 3, ...rest }) {
  return (
    <label className="block">
      <FieldLabel label={label} required={rest.required} />
      <textarea rows={rows} className={`${inputBox} ${className}`} {...rest} />
      {hint && <span className={hintText}>{hint}</span>}
    </label>
  );
}
