import Card from "./Card.jsx";
import Mascot from "./Mascot.jsx";

export default function EmptyState({ title, message, action, mood = "calm" }) {
  return (
    <Card className="animate-fade flex flex-col items-center p-10 text-center">
      <Mascot size={92} mood={mood} />
      <p className="mt-3 font-medium text-ink-900">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
