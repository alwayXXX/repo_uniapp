import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import Onboarding from './index.vue'
import { AppError } from '@/utils/error'

const mocks = vi.hoisted(() => ({
  acceptPolicies: vi.fn(),
  bootstrap: vi.fn(),
  navigateTo: vi.fn(),
  reLaunch: vi.fn(),
}))
vi.mock('@/stores/user', () => ({ useUserStore: () => mocks }))

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.acceptPolicies.mockResolvedValue(undefined)
  vi.stubGlobal('uni', { navigateTo: mocks.navigateTo, reLaunch: mocks.reLaunch })
})
afterEach(() => vi.unstubAllGlobals())

describe('explicit consent entry', () => {
  it('neither logs in nor records consent when opening the page or reading a policy', async () => {
    const page = mount(Onboarding)
    expect(page.get('.enter-button').attributes('disabled')).toBeDefined()
    await page.get('.enter-button').trigger('click')
    await page.get('.agree-link').trigger('click')
    expect(mocks.navigateTo).toHaveBeenCalledWith({
      url: '/pages/profile/agreement?type=privacy',
    })
    expect(mocks.acceptPolicies).not.toHaveBeenCalled()
    expect(mocks.bootstrap).not.toHaveBeenCalled()
  })

  it('requires both the checkbox and an explicit button press', async () => {
    let finish = () => {}
    mocks.acceptPolicies.mockReturnValueOnce(
      new Promise<void>((done) => {
        finish = done
      }),
    )
    const page = mount(Onboarding)
    await page.get('checkbox-group').trigger('change', { detail: { value: ['accepted'] } })
    expect(mocks.acceptPolicies).not.toHaveBeenCalled()
    await page.get('.enter-button').trigger('click')
    await page.get('.enter-button').trigger('click')
    expect(mocks.acceptPolicies).toHaveBeenCalledOnce()
    expect(mocks.bootstrap).not.toHaveBeenCalled()
    expect(mocks.reLaunch).not.toHaveBeenCalled()
    finish()
    await flushPromises()
    expect(mocks.reLaunch).toHaveBeenCalledWith({ url: '/pages/home/index' })
  })

  it('keeps a failed agreement submission on the page and allows retry', async () => {
    mocks.acceptPolicies.mockRejectedValueOnce(
      new AppError('INTERNAL_ERROR', 'Consent unavailable'),
    )
    const page = mount(Onboarding)
    await page.get('checkbox-group').trigger('change', { detail: { value: ['accepted'] } })
    await page.get('.enter-button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Consent unavailable')
    expect(mocks.reLaunch).not.toHaveBeenCalled()
    expect(page.get('.enter-button').attributes('disabled')).toBeUndefined()
    await page.get('.enter-button').trigger('click')
    await flushPromises()
    expect(mocks.acceptPolicies).toHaveBeenCalledTimes(2)
    expect(mocks.reLaunch).toHaveBeenCalledOnce()
  })
})
