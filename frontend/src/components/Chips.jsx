// A row of toggle buttons for a quick filter, e.g. appointment status. Scrolls
// sideways on a narrow screen instead of wrapping into a tall block.
export default function Chips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-white/70 bg-white/60 text-ink-700 hover:bg-white"
            }`}
          >
            {option.label}
            {option.count != null && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-brand-100 text-brand-700"}`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
