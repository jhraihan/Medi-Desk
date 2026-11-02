import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { useDebounced } from "../hooks.js";
import { FieldLabel } from "./Input.jsx";
import { inputBox } from "./styles.js";

// Pick one record by typing part of its name, for lists too long for a <select>.
// search(text) resolves to [{value, label, hint}] and must keep the same identity
// between renders (define it outside the component). value is the chosen option.
export default function SearchPicker({
  label,
  hint,
  placeholder = "Type a name to search…",
  required,
  value,
  onChange,
  search,
  disabled = false,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [active, setActive] = useState(0);
  const settled = useDebounced(query, 250);

  useEffect(() => {
    if (!open) return;
    let current = true;

    async function run() {
      setIsLoading(true);
      try {
        const rows = await search(settled);
        if (current) {
          setOptions(rows);
          setActive(0);
        }
      } catch {
        if (current) setOptions([]);
      } finally {
        if (current) setIsLoading(false);
      }
    }

    run();
    return () => {
      current = false;
    };
  }, [settled, open, search]);

  function choose(option) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function change() {
    onChange(null);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div>
        <FieldLabel label={label} required={required} />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-300 bg-brand-50/70 px-3.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{value.label}</p>
            {value.hint && <p className="truncate text-xs text-ink-500">{value.hint}</p>}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={change}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>
        <FieldLabel label={label} required={required} />
      </label>
      <span className="relative block">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`${inputBox} pl-9`}
        />
        {isLoading && (
          <LoaderCircle
            size={15}
            className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-ink-400"
          />
        )}
      </span>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-brand-100 bg-white p-1 shadow-lg"
        >
          {options.length === 0 && !isLoading && (
            <li className="px-3 py-2.5 text-sm text-ink-500">
              {query ? "No matches. Try another spelling." : "Nothing to choose from yet."}
            </li>
          )}
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={`cursor-pointer rounded-lg px-3 py-2 ${index === active ? "bg-brand-50" : ""}`}
            >
              <p className="text-sm font-medium text-ink-900">{option.label}</p>
              {option.hint && <p className="text-xs text-ink-500">{option.hint}</p>}
            </li>
          ))}
        </ul>
      )}
      {hint && !open && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </div>
  );
}
