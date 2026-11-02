import { Search, X } from "lucide-react";
import { FieldLabel } from "./Input.jsx";
import { inputBox } from "./styles.js";

// onChange receives the text, not the event, so clearing and typing share one handler.
export default function SearchInput({ label, value, onChange, placeholder = "Search…", className = "" }) {
  return (
    <label className={`block ${className}`}>
      <FieldLabel label={label} />
      <span className="relative block">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={label ? undefined : placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Inside a dialog, the first Escape clears the box rather than closing it.
            if (event.key === "Escape" && value) {
              event.stopPropagation();
              onChange("");
            }
          }}
          className={`${inputBox} pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden`}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1 text-ink-400 hover:bg-brand-50 hover:text-ink-700"
          >
            <X size={14} />
          </button>
        )}
      </span>
    </label>
  );
}
