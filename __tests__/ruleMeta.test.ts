import { describe, expect, it } from 'vitest'
import { getRuleMeta, RULE_META } from '@/lib/ruleMeta'
import { ALERT_RULE_TYPES } from '@/types'

describe('rule metadata', () => {
  it('provides a label, description, and style for every alert rule type', () => {
    for (const type of ALERT_RULE_TYPES) {
      const metadata = RULE_META[type]

      expect(metadata.label).toBeTruthy()
      expect(metadata.description).toBeTruthy()
      expect(metadata.style).toBeTruthy()
      expect(getRuleMeta(type)).toBe(metadata)
    }
  })
})
