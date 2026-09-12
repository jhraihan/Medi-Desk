const MOODS = {
  happy: { eye: 3.2, mouth: "M 41 58 q 9 8 18 0", brow: 0 },
  calm: { eye: 2.7, mouth: "M 43 59 q 7 4 14 0", brow: 0 },
  caring: { eye: 3.2, mouth: "M 41 58 q 9 7 18 0", brow: -1.5 },
  alert: { eye: 3.5, mouth: "M 43 60 q 7 -4 14 0", brow: -2.5 },
};

export default function Mascot({ size = 96, mood = "happy", floating = true, className = "" }) {
  const face = MOODS[mood] ?? MOODS.happy;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Medi, the MediDesk mascot"
      className={`${floating ? "animate-float" : ""} ${className}`}
    >
      <defs>
        <linearGradient id="medi-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#d6ecef" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="medi-cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2d7f8e" />
          <stop offset="100%" stopColor="#1b5360" />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="92" rx="24" ry="4" fill="#0c222e" opacity="0.12" />

      <rect x="18" y="26" width="64" height="58" rx="22" fill="url(#medi-body)" />
      <rect
        x="18"
        y="26"
        width="64"
        height="58"
        rx="22"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.6"
        opacity="0.9"
      />

      <path d="M 22 40 a 28 28 0 0 1 56 0 z" fill="url(#medi-cap)" />
      <rect x="45" y="16" width="10" height="4" rx="2" fill="#ffffff" opacity="0.9" />
      <rect x="48" y="13" width="4" height="10" rx="2" fill="#ffffff" opacity="0.9" />

      <circle cx="38" cy={47 + face.brow} r={face.eye} fill="#133641" />
      <circle cx="62" cy={47 + face.brow} r={face.eye} fill="#133641" />
      <circle cx="39.2" cy={45.8 + face.brow} r="1" fill="#ffffff" opacity="0.85" />
      <circle cx="63.2" cy={45.8 + face.brow} r="1" fill="#ffffff" opacity="0.85" />

      <path
        d={face.mouth}
        fill="none"
        stroke="#133641"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      <circle cx="29" cy="55" r="3.4" fill="#4a9caa" opacity="0.28" />
      <circle cx="71" cy="55" r="3.4" fill="#4a9caa" opacity="0.28" />

      <g className="animate-beat" style={{ transformOrigin: "50px 74px" }}>
        <path
          d="M 50 79 l -5 -4.8 a 3.3 3.3 0 1 1 5 -4.3 a 3.3 3.3 0 1 1 5 4.3 z"
          fill="#e05a6d"
        />
      </g>
    </svg>
  );
}
