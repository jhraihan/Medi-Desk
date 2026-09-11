import Card from "./Card.jsx";

export default function StatTile({ label, value, hint, icon: Icon, tone = "glass" }) {
  const dark = tone === "tinted";

  return (
    <Card tone={tone} className="lift p-5">
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
    </Card>
  );
}
