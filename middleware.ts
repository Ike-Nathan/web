import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com'
  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon.stellar.org'
  const sorobanUrl =
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
    'https://mainnet.stellar.validationcloud.io'
  const cspAllowList = [
    "'self'",
    `https://${new URL(apiUrl).hostname}`,
    `https://${new URL(horizonUrl).hostname}`,
    `https://${new URL(sorobanUrl).hostname}`,
  ]
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
