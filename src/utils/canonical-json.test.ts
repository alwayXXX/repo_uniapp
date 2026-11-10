import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { aiInputDigest, canonicalJson } from './canonical-json'

const require = createRequire(import.meta.url)
const server = require('../../cloudfunctions/gearflow-ai/canonical.js') as {
  canonicalJson(value: unknown): string
}

describe('AI request canonical JSON', () => {
  it('produces identical bytes and digests across client and cloud function', () => {
    const data = {
      year: 2026,
      months: [
        { text: '设备 💡', cents: 0 },
        { cents: 42, text: null },
      ],
      enabled: true,
    }
    const expected = server.canonicalJson(data)
    expect(canonicalJson(data)).toBe(expected)
    expect(aiInputDigest(data)).toBe(createHash('sha256').update(expected, 'utf8').digest('hex'))
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
  })

  it('rejects undefined and non-integer numeric values instead of hashing ambiguous data', () => {
    for (const data of [{ value: undefined }, { value: Number.NaN }, { value: 0.5 }]) {
      expect(() => canonicalJson(data)).toThrow()
      expect(() => server.canonicalJson(data)).toThrow()
    }
  })
})
