import { inputBox, labelText } from "./styles.js";

export default function Input({ label, error, className = "", ...rest }) {
  return (
    <label className="block">
      {label && <span className={labelText}>{label}</span>}
      <input className={`${inputBox} ${className}`} {...rest} />
      {error && (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      )}
    </label>
  );
}
