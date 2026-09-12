import Mascot from "./Mascot.jsx";

export default function Loading({ message = "Just a moment…" }) {
  return (
    <div className="animate-fade flex flex-col items-center py-16 text-center">
      <Mascot size={80} mood="calm" />
      <svg width="120" height="14" viewBox="0 0 120 14" className="mt-3">
        <path
          d="M 2 7 h 26 l 6 -5 l 7 10 l 6 -12 l 7 14 l 6 -7 h 58"
          fill="none"
          stroke="#2d7f8e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-sweep"
        />
      </svg>
      <p className="mt-2 text-sm text-ink-500">{message}</p>
    </div>
  );
}
