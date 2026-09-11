export default function SectionTitle({ eyebrow, title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <span className="pill bg-brand-100 text-brand-700">{eyebrow}</span>
        )}
        <h2 className="mt-2 text-2xl font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
