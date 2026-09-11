export default function Table({ columns, children }) {
  return (
    <div className="overflow-x-auto rounded-2xl glass">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
          <tr>
            {columns.map((col, index) => (
              <th key={index} className="px-4 py-3">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/60">{children}</tbody>
      </table>
    </div>
  );
}
