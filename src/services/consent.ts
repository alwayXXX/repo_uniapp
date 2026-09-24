import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'
import { isRecord } from '@/utils/error'

export const CONSENT_STORAGE_KEY = 'gf_policy_consent'

export function hasCurrentConsent(): boolean {
  const saved: unknown = uni.getStorageSync(CONSENT_STORAGE_KEY)
  return (
    isRecord(saved) &&
    saved.privacyVersion === PRIVACY_VERSION &&
    saved.termsVersion === TERMS_VERSION
  )
}

export function saveCurrentConsent(): void {
  uni.setStorageSync(CONSENT_STORAGE_KEY, {
    privacyVersion: PRIVACY_VERSION,
    termsVersion: TERMS_VERSION,
  })
  uni.removeStorageSync('gf_onboarded')
}

export function clearConsent(): void {
  uni.removeStorageSync(CONSENT_STORAGE_KEY)
  uni.removeStorageSync('gf_onboarded')
}

export function requireCurrentConsent(): boolean {
  if (hasCurrentConsent()) return true
  uni.reLaunch({ url: '/pages/onboarding/index' })
  return false
}
