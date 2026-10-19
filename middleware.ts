import { NextRequest, NextResponse } from 'next/server'
import { networkOrigins } from './lib/networkUrls.mjs'

export function middleware(request: NextRequest) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com'
  // Every network's Horizon and Soroban RPC origin (with overrides), the
  // same allow-list as next.config.mjs, so testnet/futurenet lookups and
  // per-network endpoints are not blocked.
  const cspAllowList = ["'self'", new URL(apiUrl).origin, ...networkOrigins()]
    .filter((source, index, sources) => sources.indexOf(source) === index)
    .join(' ')
  const csp = [
    `default-src ${cspAllowList}`,
    `script-src ${cspAllowList} 'nonce-${nonce}'`,
    `connect-src ${cspAllowList} wss:`,
    "frame-src 'self' https://connect.freighter.app",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
