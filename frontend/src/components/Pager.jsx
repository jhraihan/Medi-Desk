import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button.jsx";

// The API pages lists 25 rows at a time (PAGE_SIZE in settings.py).
export default function Pager({ page, count, pageSize = 25, onChange }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);

  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-500">
      <span>
        Showing {first}–{last} of {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </Button>
        <span className="px-1 text-xs font-medium text-ink-700">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}
