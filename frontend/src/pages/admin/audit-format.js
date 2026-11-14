export const ACTION_TONES = {
  create: "success",
  update: "brand",
  delete: "danger",
  read: "neutral",
};

// The log stores field names only, never values, so this is all there is to show.
export function describeChange(entry) {
  const target = `${entry.target_model} #${entry.target_id}`;
  const fields = entry.changes?.fields;
  if (fields?.length) return `${target} · ${fields.join(", ")}`;
  if (entry.changes?.export) return `${target} · exported to ${entry.changes.export.toUpperCase()}`;
  return target;
}
