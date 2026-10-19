/**
 * CSV serialization helpers.
 *
 * Values are quoted and embedded double quotes are escaped as "" so that
 * commas, quotes and newlines inside a value do not corrupt the file.
 * Cells that begin with a formula trigger (=, +, -, @, tab, carriage return)
 * are prefixed with a single quote to prevent formula injection when the
 * file is opened in Excel, Sheets or similar spreadsheet software.
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

/**
 * Escape a single CSV cell value.
 *
 * - Embedded double quotes are doubled (" -> "").
 * - Values starting with a formula trigger are prefixed with a single quote.
 * - The result is always wrapped in double quotes.
 */
function escapeCSVCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value)

  if (str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`
  }

  return `"${str.replace(/"/g, '""')}"`
}

/**
 * Build a CSV document from a header row and data rows.
 *
 * @param headers Column headers.
 * @param rows    Row values; each row is serialized in order.
 * @param delimiter Column separator, defaults to a comma.
 */
export function buildCSV(
  headers: string[],
  rows: unknown[][],
  delimiter = ','
): string {
  const lines: string[] = []

  lines.push(headers.map(escapeCSVCell).join(delimiter))

  for (const row of rows) {
    lines.push(row.map(escapeCSVCell).join(delimiter))
  }

  return lines.join('\r\n')
}
