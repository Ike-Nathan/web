import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

describe('web app manifest', () => {
  it('uses the TxWatch brand and references existing Apple and maskable icons', () => {
    const appManifest = manifest()

    expect(appManifest.name).toBe('TxWatch')
    expect(appManifest.short_name).toBe('TxWatch')
    expect(appManifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/apple-icon.png',
          sizes: '180x180',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: '/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        }),
      ])
    )
    expect(existsSync(resolve(process.cwd(), 'app/apple-icon.png'))).toBe(true)
    expect(
      existsSync(resolve(process.cwd(), 'public/icon-maskable-512.png'))
    ).toBe(true)
  })
})
