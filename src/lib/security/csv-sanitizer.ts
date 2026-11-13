/**
 * StockFlow Production Security — CSV Formula Injection Protection
 *
 * Prevents CSV / Spreadsheet Formula Injection (CWE-1236 / CAPEC-610)
 * when opening exported CSV files in Microsoft Excel, LibreOffice Calc, or Google Sheets.
 *
 * If a cell begins with =, +, -, @, \t, or \r, an attacker could trigger formula execution,
 * dynamic data exchange (DDE), or external link execution.
 * Prepending a single quote (') forces spreadsheet engines to interpret the content as literal text.
 */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }

  let text = String(val);

  // If starts with trigger character, prepend single quote
  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0])) {
    text = "'" + text;
  }

  // Escape any existing double quotes by doubling them
  const escaped = text.replace(/"/g, '""');

  // Wrap in double quotes
  return `"${escaped}"`;
}

export function generateCsv<T>(
  headers: { label: string; key?: keyof T; format?: (row: T) => unknown }[],
  data: T[],
): string {
  const headerLine = headers.map((h) => sanitizeCsvValue(h.label)).join(",");
  const rows = data.map((row) =>
    headers
      .map((h) => {
        if (h.format) {
          return sanitizeCsvValue(h.format(row));
        }
        if (h.key) {
          return sanitizeCsvValue(row[h.key]);
        }
        return '""';
      })
      .join(","),
  );

  return "\uFEFF" + [headerLine, ...rows].join("\r\n");
}

