import ipaddr from 'ipaddr.js'

/**
 * IP classification shared by the client-side webhook URL check and the
 * test-webhook proxy (#260). Ranges come from ipaddr.js; anything other than
 * global unicast (loopback, private, unique-local, link-local, CGNAT,
 * benchmarking, documentation, multicast, IPv4-in-IPv6 transition ranges, ...)
 * is treated as non-public.
 */
export type HostClass = 'public' | 'loopback' | 'linkLocal' | 'private'

/** `[::1]` -> `::1`; other hostnames are returned unchanged. */
export function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

export function isIpLiteral(hostname: string): boolean {
  return ipaddr.isValid(stripBrackets(hostname))
}

/** Classify an IP address (IPv4-mapped IPv6 is classified as its IPv4 address). */
export function classifyIp(address: string): HostClass {
  const range = ipaddr.process(stripBrackets(address)).range()
  if (range === 'unicast') return 'public'
  if (range === 'loopback' || range === 'unspecified') return 'loopback'
  if (range === 'linkLocal') return 'linkLocal'
  return 'private'
}

/**
 * Classify a URL hostname. IP literals are classified by range; `localhost`
 * names are loopback; other names are 'public' here and must be resolved
 * before connecting (see lib/webhookProxy.ts).
 */
export function classifyHost(hostname: string): HostClass {
  const host = stripBrackets(hostname.toLowerCase()).replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback'
  if (ipaddr.isValid(host)) return classifyIp(host)
  return 'public'
}
