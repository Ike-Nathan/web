export type AmountInput = string | number | bigint

export interface AmountOptions {
  /** Native precision of the token (from token metadata). Default 7. */
  decimals?: number
  /** Digits shown after the point. Defaults to the asset's display precision (7). */
  displayDecimals?: number
}

// Display precision per asset. Stellar classic assets (incl. USDC) have 7 decimals.
const ASSET_DECIMALS: Record<string, number> = {
  XLM: 7,
  USDC: 7,
  native: 7,
}

const DEFAULT_DECIMALS = 7

interface Decimal {
  /** Signed integer numerator; the value is units / 10^scale. */
  units: bigint
  scale: number
}

/** Parses input into an exact decimal without going through floating point (for strings/bigints). */
function parseDecimal(raw: AmountInput): Decimal | null {
  if (typeof raw === 'bigint') return { units: raw, scale: 0 }
  let str: string
  if (typeof raw === 'number') {
    if (!isFinite(raw)) return null
    str = Number.isInteger(raw) ? BigInt(raw).toString() : String(raw)
    if (/e/i.test(str)) str = raw.toFixed(20).replace(/0+$/, '')
  } else {
    str = raw.trim()
  }
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(str)
  if (!m || (!m[2] && !m[3])) {
    // Fallback for legacy inputs such as "1e3"; precision is best-effort there.
    const n = parseFloat(str)
    return isFinite(n) && typeof raw === 'string' ? parseDecimal(n) : null
  }
  const frac = m[3] ?? ''
  const units = BigInt(`${m[2] || '0'}${frac}`)
  return { units: m[1] === '-' ? -units : units, scale: frac.length }
}

const pow10 = (n: number): bigint => 10n ** BigInt(n)

/** Rounds (half away from zero) to `digits` decimals and renders with integer arithmetic. */
function renderFixed(d: Decimal, digits: number): string {
  let units = d.units
  if (d.scale > digits) {
    const div = pow10(d.scale - digits)
    const neg = units < 0n
    const abs = neg ? -units : units
    let q = abs / div
    if ((abs % div) * 2n >= div) q += 1n
    units = neg ? -q : q
  } else if (d.scale < digits) {
    units *= pow10(digits - d.scale)
  }
  const neg = units < 0n
  const s = (neg ? -units : units).toString().padStart(digits + 1, '0')
  const int = s.slice(0, s.length - digits)
  const frac = digits > 0 ? `.${s.slice(-digits)}` : ''
  return `${neg ? '-' : ''}${int}${frac}`
}

function toValue(
  raw: AmountInput,
  stroops: boolean,
  decimals: number
): Decimal | null {
  const d = parseDecimal(raw)
  if (!d) return null
  return stroops ? { units: d.units, scale: d.scale + decimals } : d
}

/** Renders an integer string with thousands separators (e.g. "50000000000" -> "50,000,000,000"). */
function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatAmount(
  raw: AmountInput,
  asset: string = 'XLM',
  stroops = false,
  options: AmountOptions = {}
): string {
  const value = toValue(raw, stroops, options.decimals ?? DEFAULT_DECIMALS)
  if (!value) return `— ${asset}`
  const decimals =
    options.displayDecimals ??
    ASSET_DECIMALS[asset.toUpperCase()] ??
    DEFAULT_DECIMALS
  const label = asset === 'native' ? 'XLM' : asset.toUpperCase()
  const rendered = renderFixed(value, decimals)
  const [int, frac] = rendered.split('.')
  const grouped = `${groupThousands(int)}${frac !== undefined ? `.${frac}` : ''}`
  return `${grouped} ${label}`
}

export function formatAmountValue(
  raw: AmountInput,
  asset: string = 'XLM',
  stroops = false,
  options: AmountOptions = {}
): string {
  return formatAmount(raw, asset, stroops, options).split(' ')[0]
}

export function isZeroAmount(raw: AmountInput): boolean {
  const d = parseDecimal(raw)
  return d !== null && d.units === 0n
}

export function formatAmountCompact(
  raw: AmountInput,
  asset: string = 'XLM',
  stroops = false,
  options: AmountOptions = {}
): string {
  const value = toValue(raw, stroops, options.decimals ?? DEFAULT_DECIMALS)
  if (!value) return `— ${asset}`
  const label = asset === 'native' ? 'XLM' : asset.toUpperCase()
  // Pick the unit by the *rounded* value: 999.995 already prints as 1000.00, so it moves up a unit.
  const abs = value.units < 0n ? -value.units : value.units
  const s = pow10(value.scale)
  if (abs * 1000n >= 999_995_000n * s)
    return `${renderFixed({ ...value, scale: value.scale + 6 }, 2)}M ${label}`
  if (abs * 1000n >= 999_995n * s)
    return `${renderFixed({ ...value, scale: value.scale + 3 }, 2)}K ${label}`
  return `${renderFixed(value, 2)} ${label}`
}
