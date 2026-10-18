import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { classifyHost, classifyIp, isIpLiteral } from '@/lib/ipRanges'

/**
 * Server-only helpers for the test-webhook proxy (#259, #261).
 */

/** The target resolves to (or is) a non-public address. */
export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockedAddressError'
  }
}

/** Resolve every address of `hostname`; reject if any is not public. */
export function resolvePublicAddresses(
  hostname: string
): Promise<dns.LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return reject(err)
      if (!addresses.length)
        return reject(new Error(`${hostname} did not resolve`))
      const blocked = addresses.find((a) => classifyIp(a.address) !== 'public')
      if (blocked) {
        return reject(
          new BlockedAddressError(
            `${hostname} resolves to a non-public address (${blocked.address})`
          )
        )
      }
      resolve(addresses)
    })
  })
}

/**
 * `lookup` hook for the outgoing socket: the connection only ever uses
 * addresses vetted in this same lookup, so a DNS-rebinding answer between the
 * up-front check and the connect cannot reach a private address.
 */
export const vettedLookup = ((hostname, options, callback) => {
  resolvePublicAddresses(hostname).then(
    (addresses) => {
      const family =
        options.family === 4 || options.family === 6 ? options.family : 0
      const list = family
        ? addresses.filter((a) => a.family === family)
        : addresses
      if (!list.length) {
        const err = Object.assign(
          new Error(`${hostname} has no IPv${family} address`),
          {
            code: 'ENOTFOUND',
          }
        )
        return callback(err, '', 4)
      }
      if (options.all) callback(null, list)
      else callback(null, list[0].address, list[0].family)
    },
    (err) => callback(err, '', 4)
  )
}) as LookupFunction

export interface DeliveryResult {
  status: number
  /** Location header of a 3xx response; redirects are never followed. */
  location: string | null
}

/**
 * POST `body` to `url`, connecting only to vetted public addresses and never
 * following redirects. Rejects with an Error named 'TimeoutError' on timeout.
 */
export function deliverWebhook(
  url: URL,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<DeliveryResult> {
  if (isIpLiteral(url.hostname) && classifyHost(url.hostname) !== 'public') {
    return Promise.reject(
      new BlockedAddressError('Private and loopback target URLs are blocked')
    )
  }
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': String(Buffer.byteLength(body)),
        },
        lookup: vettedLookup,
      },
      (res) => {
        res.resume()
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
        })
      }
    )
    req.setTimeout(timeoutMs, () => {
      const err = new Error('Webhook request timed out')
      err.name = 'TimeoutError'
      req.destroy(err)
    })
    req.on('error', reject)
    req.end(body)
  })
}

/**
 * Fixed-window per-key rate limiter (in memory, per server instance).
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>()
  return (
    key: string,
    now = Date.now()
  ): { allowed: boolean; retryAfterMs: number } => {
    if (windows.size > 10000) {
      windows.forEach((w, k) => {
        if (now - w.start >= windowMs) windows.delete(k)
      })
    }
    let w = windows.get(key)
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 }
      windows.set(key, w)
    }
    w.count += 1
    return { allowed: w.count <= limit, retryAfterMs: w.start + windowMs - now }
  }
}
