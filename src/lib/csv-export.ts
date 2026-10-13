/**
 * CSV export utility — generates a well-formed CSV string from an array of
 * objects, properly escaping commas, quotes, and newlines. Used for the
 * product buyer report exports.
 */
function escapeCsv(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(
  rows: Record<string, string | number | null | undefined>[],
  headers: { key: string; label: string }[],
): string {
  const headerLine = headers.map((h) => escapeCsv(h.label)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(row[h.key] as string | null | undefined)).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
