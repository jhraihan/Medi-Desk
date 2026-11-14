export function apiError(problem, fallback = "Something went wrong.") {
  const data = problem?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  // A ValidationError raised with a plain message arrives as ["message"].
  if (Array.isArray(data)) return typeof data[0] === "string" ? data[0] : fallback;
  if (data.detail) return data.detail;

  const firstField = Object.values(data).find(
    (value) => Array.isArray(value) && value.length,
  );
  return firstField ? firstField[0] : fallback;
}
