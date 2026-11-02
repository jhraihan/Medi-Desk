import { Children } from "react";

// isLoading with no rows yet shows placeholder rows; no rows once loaded shows `empty`.
export default function Table({ columns, children, isLoading = false, empty = "Nothing to show yet." }) {
  const hasRows = Children.toArray(children).length > 0;

  return (
    <div
      aria-busy={isLoading || undefined}
      className={`overflow-x-auto rounded-2xl glass transition-opacity duration-200 ${
        isLoading && hasRows ? "opacity-60" : ""
      }`}
    >
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
          <tr>
            {columns.map((col, index) => (
              <th key={index} scope="col" className="px-4 py-3 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/60">
          {hasRows
            ? children
            : isLoading
              ? [0, 1, 2].map((row) => (
                  <tr key={row} aria-hidden="true">
                    {columns.map((_, cell) => (
                      <td key={cell} className="px-4 py-3.5">
                        <span className="block h-3.5 w-3/4 animate-pulse rounded-full bg-brand-100/80" />
                      </td>
                    ))}
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ink-500">
                    {empty}
                  </td>
                </tr>
              )}
        </tbody>
      </table>
    </div>
  );
}
