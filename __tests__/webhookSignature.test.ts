import { createHmac } from 'node:crypto'
import {
  DEFAULT_SIGNATURE_TOLERANCE_SECONDS,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../lib/webhookSignature'

const SECRET = 'whsec_test'
const BODY = '{"contract_id":"CABC","is_test":true}'
const T = 1_760_000_000

describe('signWebhookPayload', () => {
  it('signs "<t>.<body>" with HMAC-SHA256 in t=,v1= form', async () => {
    const expected = createHmac('sha256', SECRET)
      .update(`${T}.${BODY}`)
      .digest('hex')
    expect(await signWebhookPayload(SECRET, BODY, T)).toBe(
      `t=${T},v1=${expected}`
    )
  })

  it('uses the current time by default', async () => {
    const before = Math.floor(Date.now() / 1000)
    const header = await signWebhookPayload(SECRET, BODY)
    const t = Number(header.match(/^t=(\d+),v1=[0-9a-f]{64}$/)?.[1])
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(before + 2)
  })

  it('generates unique whsec_ secrets', () => {
    const a = generateWebhookSecret()
    expect(a).toMatch(/^whsec_[0-9a-f]{64}$/)
    expect(generateWebhookSecret()).not.toBe(a)
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts a valid, fresh signature', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T)
    await expect(
      verifyWebhookSignature(SECRET, BODY, header, { now: T + 10 })
    ).resolves.toEqual({ valid: true, timestamp: T })
  })

  it('rejects a stale signature (replay outside the 5-minute window)', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T)
    const now = T + DEFAULT_SIGNATURE_TOLERANCE_SECONDS + 1
    await expect(
      verifyWebhookSignature(SECRET, BODY, header, { now })
    ).resolves.toEqual({ valid: false, reason: 'stale' })
  })

  it('rejects a timestamp too far in the future', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T + 3600)
    await expect(
      verifyWebhookSignature(SECRET, BODY, header, { now: T })
    ).resolves.toMatchObject({ reason: 'stale' })
  })

  it('rejects a tampered body', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T)
    await expect(
      verifyWebhookSignature(SECRET, BODY.replace('true', 'false'), header, {
        now: T,
      })
    ).resolves.toEqual({ valid: false, reason: 'mismatch' })
  })

  it('rejects a tampered timestamp (old signature re-stamped as fresh)', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T)
    const restamped = header.replace(`t=${T}`, `t=${T + 1000}`)
    await expect(
      verifyWebhookSignature(SECRET, BODY, restamped, { now: T + 1000 })
    ).resolves.toEqual({ valid: false, reason: 'mismatch' })
  })

  it('rejects the wrong secret', async () => {
    const header = await signWebhookPayload(SECRET, BODY, T)
    await expect(
      verifyWebhookSignature('other', BODY, header, { now: T })
    ).resolves.toMatchObject({ reason: 'mismatch' })
  })

  it('accepts any matching v1 entry (secret rotation)', async () => {
    const oldSig = (await signWebhookPayload('old-secret', BODY, T)).split(
      ','
    )[1]
    const header = `${await signWebhookPayload(SECRET, BODY, T)},${oldSig}`
    await expect(
      verifyWebhookSignature('old-secret', BODY, header, { now: T })
    ).resolves.toMatchObject({ valid: true })
  })

  it.each([
    undefined,
    '',
    'sha256=abcd',
    `t=${T}`,
    'v1=abcd',
    `t=soon,v1=${'0'.repeat(64)}`,
  ])('rejects a malformed header %j', async (header) => {
    await expect(
      verifyWebhookSignature(SECRET, BODY, header, { now: T })
    ).resolves.toEqual({ valid: false, reason: 'malformed' })
  })
})
