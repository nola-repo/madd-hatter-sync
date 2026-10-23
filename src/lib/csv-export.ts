/**
 * CSV export utility — generates a well-formed CSV string from an array of
 * objects, properly escaping commas, quotes, and newlines. Used for the
 * product buyer report exports.
 *
 * SECURITY: formula-injection protection.
 * Values beginning with =, +, -, @, TAB, or CR are prefixed with a tab so
 * that no spreadsheet application (Excel, Google Sheets, LibreOffice) treats
 * them as formula cells. The tab character itself is then quoted per RFC 4180.
 * This is the OWASP-recommended approach for CSV exports.
 */
const FORMULA_INJECTION_PREFIXES = /^[=+\-@\t\r]/;

function escapeCsv(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Neutralise formula injection: prefix with tab so the cell is treated as
  // plain text by spreadsheet applications.
  if (FORMULA_INJECTION_PREFIXES.test(str)) {
    str = "\t" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || str.includes("\t")) {
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
