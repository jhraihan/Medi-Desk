// One place for how money, dates and names read across the app, so every page agrees.

export function money(value) {
  return `৳${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// "2025-03-01" parsed by Date is midnight UTC, which is the day before anywhere west
// of Greenwich. Date-only strings are read as a local date instead.
function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function formatDate(value) {
  if (!value) return "—";
  return toDate(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(value) {
  if (!value) return "—";
  return toDate(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayOffset(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return Math.round((day - today) / 86_400_000);
}

// "Today, 10:30", "Tomorrow, 09:00", otherwise "Mon 3 Nov 2025, 10:30".
export function formatDateTime(value) {
  if (!value) return "—";
  const date = toDate(value);
  const offset = dayOffset(date);
  const time = formatTime(date);
  if (offset === 0) return `Today, ${time}`;
  if (offset === 1) return `Tomorrow, ${time}`;
  if (offset === -1) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${day}, ${time}`;
}

export function isToday(value) {
  return Boolean(value) && dayOffset(toDate(value)) === 0;
}

// YYYY-MM-DD for the local calendar day. toISOString() gives the UTC day, which is
// yesterday for the first hours after midnight east of Greenwich.
export function localISODate(date = new Date()) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function humanize(value) {
  return String(value ?? "").replaceAll("_", " ");
}

export function fullName(details, fallback = "") {
  const name = [details?.first_name, details?.last_name].filter(Boolean).join(" ");
  return name || details?.username || fallback;
}
