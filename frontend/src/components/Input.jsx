import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { hintText, inputBox, labelText } from "./styles.js";

export function FieldLabel({ label, required }) {
  if (!label) return null;
  return (
    <span className={labelText}>
      {label}
      {required && (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      )}
    </span>
  );
}

// Password fields get a show/hide toggle: typos in a hidden field are the most
// common reason a sign-in fails.
export default function Input({ label, hint, error, className = "", type = "text", ...rest }) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block">
      <FieldLabel label={label} required={rest.required} />
      <span className="relative block">
        <input
          type={isPassword && reveal ? "text" : type}
          aria-invalid={error ? true : undefined}
          className={`${inputBox} ${isPassword ? "pr-11" : ""} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((shown) => !shown)}
            aria-label={reveal ? "Hide password" : "Show password"}
            title={reveal ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-ink-400 transition-colors hover:text-ink-700 focus-visible:text-brand-700 focus-visible:outline-none"
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </span>
      {error ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>
      ) : (
        hint && <span className={hintText}>{hint}</span>
      )}
    </label>
  );
}
