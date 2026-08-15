import { inputBox, labelText } from "./styles.js";

export default function Textarea({ label, className = "", rows = 3, ...rest }) {
  return (
    <label className="block">
      {label && <span className={labelText}>{label}</span>}
      <textarea rows={rows} className={`${inputBox} ${className}`} {...rest} />
    </label>
  );
}
