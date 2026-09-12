export function apiError(problem, fallback = "Something went wrong.") {
  const data = problem?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;

  const firstField = Object.values(data).find(
    (value) => Array.isArray(value) && value.length,
  );
  return firstField ? firstField[0] : fallback;
}
