import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useUserStore } from './user'
import { useDeviceStore } from './device'
import { PRIVACY_VERSION, TERMS_VERSION } from '@/constants/policies'
import { hasCurrentConsent, saveCurrentConsent } from '@/services/consent'
import type { DeviceDoc } from '@/types/device'

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  restore: vi.fn(),
  bootstrap: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
  clearExports: vi.fn(),
  listDevices: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('@/services/auth', () => ({
  signInSilently: mocks.signIn,
  fetchCurrentUser: mocks.restore,
  bootstrapIdentity: mocks.bootstrap,
  signOut: mocks.signOut,
  deleteAccount: mocks.deleteAccount,
  updateProfile: mocks.updateProfile,
  ensureSession: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/export', () => ({ clearGeneratedExports: mocks.clearExports }))
vi.mock('@/services/category', () => ({
  getCategoryName: () => '',
  listCategories: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/device', () => ({ listDevices: mocks.listDevices, softDeleteDevice: vi.fn() }))

const user = { id: 'synthetic-user', nickname: null, avatarUrl: null }
const device: DeviceDoc = {
  id: 'synthetic-device',
  userId: 'synthetic-user',
  categoryId: 'synthetic-category',
  name: 'Test device',
  status: 'IN_USE',
  brand: null,
  model: null,
  serialNumber: null,
  purchaseDate: null,
  purchaseChannel: null,
  purchasePriceCents: null,
  currency: 'CNY',
  notes: null,
  deletedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}
let storage: Map<string, unknown>

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  storage = new Map()
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: vi.fn(),
  })
  mocks.signIn.mockResolvedValue('synthetic-identity')
  mocks.restore.mockResolvedValue(user)
  mocks.bootstrap.mockResolvedValue({ user: { ...user, isNewUser: false } })
  mocks.signOut.mockResolvedValue(undefined)
  mocks.deleteAccount.mockResolvedValue({ deletedAt: 'synthetic-time' })
  mocks.listDevices.mockResolvedValue({ items: [device], total: 1, hasMore: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('identity, consent, and cleanup', () => {
  it('restores an existing user without recording consent', async () => {
    saveCurrentConsent()
    const store = useUserStore()
    await store.bootstrap()
    expect(mocks.restore).toHaveBeenCalledOnce()
    expect(mocks.bootstrap).not.toHaveBeenCalled()
    expect(store.user).toEqual(user)
  })

  it('does not restore until the current versions have been accepted', async () => {
    storage.set('gf_onboarded', '1')
    await expect(useUserStore().bootstrap()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.bootstrap).not.toHaveBeenCalled()
  })

  it('records explicit agreement only after the server succeeds', async () => {
    const store = useUserStore()
    mocks.bootstrap.mockRejectedValueOnce(new Error('synthetic failure'))
    await expect(store.acceptPolicies()).rejects.toThrow()
    expect(hasCurrentConsent()).toBe(false)
    await store.acceptPolicies()
    expect(mocks.bootstrap).toHaveBeenLastCalledWith(PRIVACY_VERSION, TERMS_VERSION)
    expect(hasCurrentConsent()).toBe(true)
  })

  it('clears device data, filters, consent, and exports on logout', async () => {
    const store = useUserStore()
    const devices = useDeviceStore()
    await store.acceptPolicies()
    mocks.clearExports.mockClear()
    devices.items = [device]
    devices.keyword = 'synthetic query'
    storage.set('gf_stats_category_id', 'synthetic-category')
    await store.logout()
    expect(devices.items).toEqual([])
    expect(devices.keyword).toBe('')
    expect(devices.status).toBe('idle')
    expect(storage.size).toBe(0)
    expect(store.user).toBeNull()
    expect(mocks.clearExports).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  it('does not retain private cache when SDK sign-out fails', async () => {
    await useUserStore().acceptPolicies()
    useDeviceStore().items = [device]
    mocks.signOut.mockRejectedValueOnce(new Error('synthetic offline'))
    await expect(useUserStore().logout()).rejects.toThrow()
    expect(useDeviceStore().items).toEqual([])
    expect(useUserStore().user).toBeNull()
    expect(hasCurrentConsent()).toBe(false)
  })

  it('retries unfinished export cleanup before another login', async () => {
    mocks.clearExports.mockImplementationOnce(() => {
      throw new Error('synthetic cleanup failure')
    })
    await expect(useUserStore().acceptPolicies()).rejects.toThrow()
    expect(mocks.signIn).not.toHaveBeenCalled()
    await useUserStore().acceptPolicies()
    expect(hasCurrentConsent()).toBe(true)
    expect(mocks.clearExports).toHaveBeenCalledTimes(2)
  })

  it('reports completed cloud deletion separately from failed SDK sign-out', async () => {
    await useUserStore().acceptPolicies()
    mocks.signOut.mockRejectedValueOnce(new Error('synthetic offline'))
    await expect(useUserStore().deleteAccount('注销我的账号')).rejects.toThrow('云端数据已注销')
    expect(mocks.deleteAccount).toHaveBeenCalledOnce()
    expect(useUserStore().user).toBeNull()
    expect(hasCurrentConsent()).toBe(false)
  })

  it('does not delete the cloud account when local file cleanup fails', async () => {
    await useUserStore().acceptPolicies()
    mocks.clearExports.mockImplementationOnce(() => {
      throw new Error('synthetic cleanup failure')
    })
    await expect(useUserStore().deleteAccount('注销我的账号')).rejects.toThrow()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
    expect(useUserStore().deleting).toBe(false)
    expect(useUserStore().user).toEqual(user)
  })

  it('clears all local business state after account deletion', async () => {
    await useUserStore().acceptPolicies()
    useDeviceStore().items = [device]
    await useUserStore().deleteAccount('注销我的账号')
    expect(mocks.deleteAccount).toHaveBeenCalledOnce()
    expect(useDeviceStore().items).toEqual([])
    expect(useUserStore().user).toBeNull()
    expect(hasCurrentConsent()).toBe(false)
  })

  it('prevents a late device response from restoring deleted cache', async () => {
    let resolve = (_value: { items: DeviceDoc[]; total: number; hasMore: boolean }) => {}
    mocks.listDevices.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const devices = useDeviceStore()
    const loading = devices.loadFirst()
    await flushPromises()
    await useUserStore().logout()
    resolve({ items: [device], total: 1, hasMore: false })
    await loading
    expect(devices.items).toEqual([])
    expect(devices.status).toBe('idle')
  })

  it('prevents a late login from recording consent after logout', async () => {
    let resolve = (_identity: string) => {}
    mocks.signIn.mockReturnValueOnce(
      new Promise<string>((done) => {
        resolve = done
      }),
    )
    const store = useUserStore()
    const pending = store.acceptPolicies()
    const rejected = expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await store.logout()
    resolve('synthetic-identity')
    await rejected
    expect(store.user).toBeNull()
    expect(store.status).toBe('idle')
    expect(mocks.bootstrap).not.toHaveBeenCalled()
    expect(hasCurrentConsent()).toBe(false)
  })

  it('allows a new login while an invalidated user lookup is still pending', async () => {
    let resolve = (_user: typeof user) => {}
    mocks.restore.mockReturnValueOnce(
      new Promise<typeof user>((done) => {
        resolve = done
      }),
    )
    saveCurrentConsent()
    const store = useUserStore()
    const oldRestore = store.bootstrap()
    const rejected = expect(oldRestore).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await flushPromises()
    await store.logout()
    const newLogin = store.acceptPolicies()
    const newOutcome = newLogin.catch((error: unknown) => error)
    await flushPromises()
    const bootstrapCalls = mocks.bootstrap.mock.calls.length
    resolve(user)
    await rejected
    expect(await newOutcome).toBeUndefined()
    expect(bootstrapCalls).toBe(1)
    expect(store.user).toEqual(user)
    expect(hasCurrentConsent()).toBe(true)
  })
})
