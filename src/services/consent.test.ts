import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'
import {
  clearConsent,
  CONSENT_STORAGE_KEY,
  hasCurrentConsent,
  requireCurrentConsent,
  saveCurrentConsent,
} from './consent'

let storage: Map<string, unknown>
const reLaunch = vi.fn()

beforeEach(() => {
  storage = new Map()
  reLaunch.mockReset()
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('explicit policy consent', () => {
  it('does not upgrade the old onboarding flag to consent', () => {
    storage.set('gf_onboarded', '1')
    expect(requireCurrentConsent()).toBe(false)
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/onboarding/index' })
    expect(storage.has(CONSENT_STORAGE_KEY)).toBe(false)
  })

  it('requires both current policy versions', () => {
    storage.set(CONSENT_STORAGE_KEY, { privacyVersion: 'old', termsVersion: TERMS_VERSION })
    expect(hasCurrentConsent()).toBe(false)
    storage.set(CONSENT_STORAGE_KEY, { privacyVersion: PRIVACY_VERSION, termsVersion: 'old' })
    expect(hasCurrentConsent()).toBe(false)
    saveCurrentConsent()
    expect(requireCurrentConsent()).toBe(true)
    expect(reLaunch).not.toHaveBeenCalled()
  })

  it('rejects malformed storage and clears both old and current flags', () => {
    storage.set(CONSENT_STORAGE_KEY, '1')
    expect(hasCurrentConsent()).toBe(false)
    saveCurrentConsent()
    storage.set('gf_onboarded', '1')
    clearConsent()
    expect(storage.size).toBe(0)
  })
})
