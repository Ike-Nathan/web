import { NextRequest, NextResponse } from 'next/server'
import { signWebhookPayload, SIGNATURE_HEADER } from '@/lib/webhookSignature'

// SSRF prevention: block local and private network addresses
const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

function isPrivateIp(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true
  // Check private IP ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = hostname.match(ipv4Regex)
  if (match) {
    const [, a, b] = match.map(Number)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 0) return true
  }
  return false
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const data = await req.json()
    const { url, payload, secret } = data

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'A valid url is required' },
        { status: 400 }
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { ok: false, error: 'Only http and https protocols are supported' },
        { status: 400 }
      )
    }

    if (isPrivateIp(parsedUrl.hostname)) {
      return NextResponse.json(
        { ok: false, error: 'Private and loopback target URLs are blocked' },
        { status: 403 }
      )
    }

    const bodyString =
      typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (secret) {
      headers[SIGNATURE_HEADER] = await signWebhookPayload(secret, bodyString)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: controller.signal,
        // Never follow redirects: the target was only validated for the
        // submitted host, so a 3xx could point at an internal service (#258).
        redirect: 'manual',
      })
      clearTimeout(timeoutId)
      const durationMs = Date.now() - startTime
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        return NextResponse.json({
          status: res.status,
          ok: false,
          durationMs,
          location,
          error: `Webhook responded with a redirect${location ? ` to ${location}` : ''}; redirects are not followed`,
        })
      }
      return NextResponse.json({
        status: res.status,
        ok: res.ok,
        durationMs,
      })
    } catch (error) {
      const err = error as { name?: string; message?: string } | undefined
      clearTimeout(timeoutId)
      const durationMs = Date.now() - startTime
      if (err?.name === 'AbortError') {
        return NextResponse.json(
          {
            status: 504,
            ok: false,
            durationMs,
            error: 'Webhook request timed out',
          },
          { status: 504 }
        )
      }
      return NextResponse.json(
        {
          status: 500,
          ok: false,
          durationMs,
          error: err?.message || 'Failed to deliver webhook',
        },
        { status: 500 }
      )
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Malformed request body' },
      { status: 400 }
    )
  }
}
