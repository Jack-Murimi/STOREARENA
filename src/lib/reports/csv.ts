/**
 * CSV output for the report exports.
 *
 * Two problems, one module. Quotes must be doubled or a customer called
 * `Mama "Njeri" Stores` silently shifts every column to its right. And a value
 * that starts with `=`, `+`, `-` or `@` is a formula to Excel and Google
 * Sheets: customer and invoice names are free text typed by staff, so
 * `=HYPERLINK("http://evil","click")` in a customer name used to run in the
 * spreadsheet of whoever opened the export.
 */

/** Prefixes a spreadsheet reads as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell, quoted and neutralised. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * A whole document. `fields` names the query columns in the same order as
 * `heading`; deriving them from `Object.keys(rows[0])` let a header drift out
 * of line with its data whenever a SELECT gained a column.
 */
export function csvDocument(
  heading: string[],
  fields: string[],
  rows: Record<string, unknown>[],
): string {
  if (heading.length !== fields.length) {
    throw new Error(`CSV heading has ${heading.length} columns but ${fields.length} fields`);
  }
  return [
    heading.map(csvCell).join(","),
    ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(",")),
  ].join("\r\n");
}

/**
 * A real ISO date, or the fallback.
 *
 * `from=2026-13-45` used to reach PostgreSQL as a cast and turn the export into
 * a 500; a value that is merely wrong is worse, because the report silently
 * covers the wrong period.
 */
export function isoDate(raw: string | null, fallback: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) return raw;
  }
  return fallback;
}
