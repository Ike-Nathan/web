import {
  formatAmount,
  formatAmountValue,
  isZeroAmount,
  formatAmountCompact,
  validateThreshold,
} from '../lib/formatAmount';

describe('validateThreshold', () => {
  it.each([
    ['0.00000001', /at most 7 decimal places/],
    ['1e-7', /plain decimal number/],
    ['1E3', /plain decimal number/],
    ['50000000000.0000001', /cannot exceed 50,000,000,000 XLM/],
    ['0', /greater than 0/],
    ['0.0000000', /greater than 0/],
    ['-5', /valid XLM threshold/],
    ['', /valid XLM threshold/],
    ['abc', /valid XLM threshold/],
    ['1.2.3', /valid XLM threshold/],
  ])('rejects %j', (raw, error) => {
    const result = validateThreshold(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it.each([
    ['0.0000001', 0.0000001],
    ['1000.1234567', 1000.1234567],
    ['50000000000', 50_000_000_000],
    ['50000000000.0000000', 50_000_000_000],
    [' 42 ', 42],
    ['.5', 0.5],
    ['10.', 10],
  ])('accepts %j', (raw, value) => {
    expect(validateThreshold(raw)).toEqual({ ok: true, value });
  });
});

describe('formatAmount', () => {
  it('formats XLM with 7 decimal places', () => {
    expect(formatAmount('1', 'XLM')).toBe('1.0000000 XLM');
  });

  it('formats USDC with 7 decimal places', () => {
    expect(formatAmount('150.5', 'USDC')).toBe('150.5000000 USDC');
  });

  it('converts stroops to XLM', () => {
    expect(formatAmount('10000000', 'XLM', true)).toBe('1.0000000 XLM');
  });

  it('formats zero as 0.0000000 XLM', () => {
    expect(formatAmount(0, 'XLM')).toBe('0.0000000 XLM');
  });

  it('treats native as XLM label', () => {
    expect(formatAmount('1', 'native')).toBe('1.0000000 XLM');
  });

  it('falls back to 7 decimals for unknown asset', () => {
    expect(formatAmount('1', 'MYTOKEN')).toBe('1.0000000 MYTOKEN');
  });

  it('returns em-dash for non-finite input', () => {
    expect(formatAmount('abc', 'XLM')).toBe('— XLM');
  });

  it('accepts numeric input', () => {
    expect(formatAmount(2.5, 'XLM')).toBe('2.5000000 XLM');
  });
});

describe('formatAmountValue', () => {
  it('omits asset label', () => {
    expect(formatAmountValue('1', 'XLM')).toBe('1.0000000');
  });
});

describe('isZeroAmount', () => {
  it('returns true for 0', () => expect(isZeroAmount(0)).toBe(true));
  it('returns true for "0"', () => expect(isZeroAmount('0')).toBe(true));
  it('returns false for 1', () => expect(isZeroAmount(1)).toBe(false));
  it('returns false for NaN string', () => expect(isZeroAmount('abc')).toBe(false));
});

describe('formatAmountCompact', () => {
  it('abbreviates millions', () => {
    expect(formatAmountCompact(1_200_000, 'XLM')).toBe('1.20M XLM');
  });

  it('abbreviates thousands', () => {
    expect(formatAmountCompact(1500, 'XLM')).toBe('1.50K XLM');
  });

  it('shows full value under 1000', () => {
    expect(formatAmountCompact(99, 'XLM')).toBe('99.00 XLM');
  });

  it('converts stroops in compact mode', () => {
    expect(formatAmountCompact('10000000000000', 'XLM', true)).toBe('1.00M XLM');
  });
});

describe('formatAmount i128 / BigInt-safe', () => {
  it('formats bigint stroops above MAX_SAFE_INTEGER exactly', () => {
    expect(formatAmount(12345678901234567890123n, 'XLM', true)).toBe('1234567890123456.7890123 XLM');
  });

  it('formats string stroops above MAX_SAFE_INTEGER exactly', () => {
    expect(formatAmount('9007199254740993', 'XLM', true)).toBe('900719925.4740993 XLM');
  });

  it('supports arbitrary token decimals', () => {
    expect(formatAmount('1500000000000000000', 'MYTOKEN', true, { decimals: 18 })).toBe('1.5000000 MYTOKEN');
  });

  it('handles negative stroops', () => {
    expect(formatAmount('-15000000', 'XLM', true)).toBe('-1.5000000 XLM');
  });

  it('keeps number input working', () => {
    expect(formatAmount(0.1, 'XLM')).toBe('0.1000000 XLM');
  });

  it('isZeroAmount accepts bigint', () => {
    expect(isZeroAmount(0n)).toBe(true);
    expect(isZeroAmount(1n)).toBe(false);
  });
});

describe('formatAmount USDC / display precision', () => {
  it('does not truncate small USDC amounts', () => {
    expect(formatAmount('0.0012345', 'USDC')).toBe('0.0012345 USDC');
  });

  it('converts USDC stroops consistently', () => {
    expect(formatAmount('12345', 'USDC', true)).toBe('0.0012345 USDC');
  });

  it('accepts an explicit display precision', () => {
    expect(formatAmount('150.5', 'USDC', false, { displayDecimals: 2 })).toBe('150.50 USDC');
  });
});

describe('formatAmountCompact unit boundaries', () => {
  it('rolls 999999 over to M', () => {
    expect(formatAmountCompact(999999, 'XLM')).toBe('1.00M XLM');
  });

  it('rolls 999.995 over to K', () => {
    expect(formatAmountCompact(999.995, 'XLM')).toBe('1.00K XLM');
  });

  it('keeps 999.994 below K', () => {
    expect(formatAmountCompact(999.994, 'XLM')).toBe('999.99 XLM');
  });

  it('keeps 999994 in K', () => {
    expect(formatAmountCompact(999994, 'XLM')).toBe('999.99K XLM');
  });

  it('handles negatives and bigint stroops', () => {
    expect(formatAmountCompact(-999999, 'XLM')).toBe('-1.00M XLM');
    expect(formatAmountCompact(9999999999999n, 'XLM', true)).toBe('1.00M XLM');
  });
});
