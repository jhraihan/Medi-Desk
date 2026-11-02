import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Card from "./Card.jsx";

// With `to`, the whole tile links to the page behind the number.
export default function StatTile({ label, value, hint, icon: Icon, tone = "glass", to }) {
  const dark = tone === "tinted";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold uppercase tracking-wider ${dark ? "text-white/70" : "text-ink-500"}`}>
          {label}
        </p>
        {Icon && (
          <span className={`rounded-xl p-2 ${dark ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600"}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className={`mt-2 text-3xl font-semibold ${dark ? "text-white" : "text-ink-900"}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${dark ? "text-white/70" : "text-ink-500"}`}>{hint}</p>}
      {to && (
        <span
          className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${dark ? "text-white/85" : "text-brand-700"}`}
        >
          Open <ArrowUpRight size={13} />
        </span>
      )}
    </>
  );

  if (!to) {
    return (
      <Card tone={tone} className="lift p-5">
        {body}
      </Card>
    );
  }

  return (
    <Card
      as={Link}
      to={to}
      tone={tone}
      className="lift block p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      {body}
    </Card>
  );
}
