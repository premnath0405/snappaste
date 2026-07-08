/**
 * Strip HTML tags and return plain inner text.
 * Uses a single reusable div; safe for use in the extension context.
 */
const _div = document.createElement('div')

export function stripHtml(html: string): string {
  _div.innerHTML = html
  return _div.innerText
}
