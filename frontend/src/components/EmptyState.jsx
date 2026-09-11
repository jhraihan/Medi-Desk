import Card from "./Card.jsx";

export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <Card className="animate-fade p-10 text-center">
      {Icon && (
        <span className="mx-auto mb-3 inline-flex rounded-2xl bg-brand-50 p-3 text-brand-500">
          <Icon size={22} />
        </span>
      )}
      <p className="font-medium text-ink-900">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
