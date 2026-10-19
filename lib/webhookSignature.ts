/**
 * Header carrying the delivery signature, Stripe-style:
 * `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.
 *
 * Signing the timestamp together with the body lets receivers reject replays
 * of a captured delivery once it is older than their tolerance window. The
 * format must match the one emitted by tx-watch-core.
 */
export const SIGNATURE_HEADER = 'X-TxWatch-Signature'

/** Default replay window receivers should accept, in seconds (5 minutes). */
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(
    ''
  )

const fromHex = (hex: string): Uint8Array | null => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const enc = new TextEncoder()

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  )
}

/** Generates a random 32-byte webhook signing secret (hex, prefixed "whsec_"). */
export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `whsec_${toHex(bytes.buffer)}`
}

/**
 * Computes the X-TxWatch-Signature value for a raw request body.
 * @param timestamp Unix time in seconds; defaults to now.
 */
export async function signWebhookPayload(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const t = Math.floor(timestamp)
  const key = await hmacKey(secret, 'sign')
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`))
  return `t=${t},v1=${toHex(mac)}`
}

export type SignatureVerification =
  | { valid: true; timestamp: number }
  | { valid: false; reason: 'malformed' | 'stale' | 'mismatch' }

export interface VerifyWebhookSignatureOptions {
  /** Maximum allowed age (and clock skew), in seconds. Default 300. */
  toleranceSeconds?: number
  /** Current Unix time in seconds; injectable for tests. */
  now?: number
}

/**
 * Verifies an X-TxWatch-Signature header against the raw request body.
 * Rejects headers whose timestamp is outside the tolerance window (replays),
 * and compares MACs in constant time. Any of several `v1` entries may match,
 * to allow secret rotation.
 */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
  {
    toleranceSeconds = DEFAULT_SIGNATURE_TOLERANCE_SECONDS,
    now = Math.floor(Date.now() / 1000),
  }: VerifyWebhookSignatureOptions = {}
): Promise<SignatureVerification> {
  let timestamp: number | null = null
  const signatures: Uint8Array[] = []
  for (const part of (header ?? '').split(',')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name === 't' && /^\d+$/.test(value)) timestamp = Number(value)
    else if (name === 'v1') {
      const bytes = fromHex(value)
      if (bytes) signatures.push(bytes)
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return { valid: false, reason: 'malformed' }
  }
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, reason: 'stale' }
  }

  const key = await hmacKey(secret, 'verify')
  const data = enc.encode(`${timestamp}.${body}`)
  for (const sig of signatures) {
    // subtle.verify compares in constant time.
    if (await crypto.subtle.verify('HMAC', key, sig, data)) {
      return { valid: true, timestamp }
    }
  }
  return { valid: false, reason: 'mismatch' }
}
