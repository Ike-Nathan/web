import {
  MAX_BODY_SNIPPET_BYTES,
  isTextContentType,
  sanitizeBodySnippet,
} from '@/lib/bodySnippet'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('isTextContentType', () => {
  it.each([
    'text/html; charset=utf-8',
    'text/plain',
    'application/json',
    'application/problem+json',
    'application/vnd.api+json',
    'application/xml',
  ])('accepts %s', (type) => {
    expect(isTextContentType(type)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    'image/png',
    'application/octet-stream',
    'application/pdf',
  ])('rejects %s', (type) => {
    expect(isTextContentType(type)).toBe(false)
  })
})

describe('sanitizeBodySnippet', () => {
  it('returns a short text body unchanged', () => {
    expect(sanitizeBodySnippet(bytes('{"ok":true}'), 'application/json')).toBe(
      '{"ok":true}'
    )
  })

  it('returns null for non-text bodies', () => {
    expect(
      sanitizeBodySnippet(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')
    ).toBeNull()
    expect(sanitizeBodySnippet(bytes('hello'), null)).toBeNull()
  })

  it('returns null for empty or whitespace-only bodies', () => {
    expect(sanitizeBodySnippet(new Uint8Array(), 'text/plain')).toBeNull()
    expect(sanitizeBodySnippet(bytes('  \n '), 'text/plain')).toBeNull()
  })

  it('truncates to 1 KB and marks the cut', () => {
    const snippet = sanitizeBodySnippet(bytes('a'.repeat(5000)), 'text/plain')
    expect(snippet).toBe(`${'a'.repeat(MAX_BODY_SNIPPET_BYTES)}…`)
  })

  it('removes control characters but keeps tabs and newlines', () => {
    expect(
      sanitizeBodySnippet(bytes('a\u0000b\u001bc\td\r\ne'), 'text/plain')
    ).toBe('abc\td\ne')
  })

  it('does not leave a broken character when the limit splits a code point', () => {
    const snippet = sanitizeBodySnippet(
      bytes(`${'a'.repeat(MAX_BODY_SNIPPET_BYTES - 1)}é and more`),
      'text/plain'
    )
    expect(snippet).toBe(`${'a'.repeat(MAX_BODY_SNIPPET_BYTES - 1)}…`)
  })
})
