const TOKEN_REGEX = /\{\{(\w+)\}\}/g
const RESERVED_DATE = 'date'

/**
 * Returns unique placeholder token names found in `text`, excluding the
 * reserved `{{date}}` token (which is auto-filled).
 * Order reflects first appearance.
 */
export function extractPlaceholders(text: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(TOKEN_REGEX.source, 'g')
  while ((match = re.exec(text)) !== null) {
    const name = match[1]
    if (name !== RESERVED_DATE && !seen.has(name)) {
      seen.add(name)
      results.push(name)
    }
  }
  return results
}

/**
 * Replaces all `{{token}}` occurrences in `text` using `values`.
 * `{{date}}` is always auto-replaced with today's date (YYYY-MM-DD).
 * Unknown tokens that have no entry in `values` are left as-is.
 */
export function fillPlaceholders(
  text: string,
  values: Record<string, string>
): string {
  const today = new Date().toISOString().slice(0, 10)
  const allValues: Record<string, string> = { date: today, ...values }
  return text.replace(new RegExp(TOKEN_REGEX.source, 'g'), (_match, name: string) => {
    return Object.prototype.hasOwnProperty.call(allValues, name)
      ? allValues[name]
      : _match
  })
}
