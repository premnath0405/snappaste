/**
 * Copies `text` to the system clipboard.
 *
 * Primary: navigator.clipboard.writeText (requires clipboardWrite permission).
 * Fallback: execCommand via a hidden textarea (for older Firefox builds).
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // Fallback for environments where clipboard API is unavailable
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const success = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!success) {
    throw new Error('Failed to copy text to clipboard')
  }
}
