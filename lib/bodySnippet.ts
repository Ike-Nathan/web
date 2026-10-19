/**
 * Helpers for showing the first bytes of a webhook receiver's response, e.g.
 * a framework error page, when testing a webhook. Shared by the server-side
 * proxy and the direct (non-browser) delivery path, so no Node-only imports.
 */

/** Maximum snippet size, in bytes of the raw response body. */
export const MAX_BODY_SNIPPET_BYTES = 1024

const TEXT_CONTENT_TYPE =
  /^(text\/|application\/(json|xml|xhtml\+xml|javascript|x-www-form-urlencoded|problem\+json|problem\+xml)|[^;]*\+(json|xml)\b)/i

/** True when the content type is textual, so the body is safe to display. */
export function isTextContentType(
  contentType: string | null | undefined
): boolean {
  if (!contentType) return false
  return TEXT_CONTENT_TYPE.test(contentType.trim())
}

/**
 * Turns raw response bytes into a displayable snippet: text content types
 * only, at most {@link MAX_BODY_SNIPPET_BYTES} bytes, decoded as UTF-8 with
 * control characters (other than tab and newline) removed. Returns null for
 * non-text or empty bodies.
 */
export function sanitizeBodySnippet(
  bytes: Uint8Array,
  contentType: string | null | undefined
): string | null {
  if (!isTextContentType(contentType) || bytes.length === 0) return null
  const truncated = bytes.length > MAX_BODY_SNIPPET_BYTES
  const slice = truncated ? bytes.subarray(0, MAX_BODY_SNIPPET_BYTES) : bytes
  // fatal: false replaces invalid sequences (including a code point cut at
  // the byte limit) with U+FFFD instead of throwing.
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(slice)
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
    .replace(/�+$/, '')
  if (!text.trim()) return null
  return truncated ? `${text}…` : text
}
