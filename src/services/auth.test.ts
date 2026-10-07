import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapIdentity,
  deleteAccount,
  ensureSession,
  fetchCurrentUser,
  signInSilently,
  signOut,
  updateProfile,
} from './auth'

const mocks = vi.hoisted(() => ({
  callGearFlowApi: vi.fn(),
  ensureCloudbaseInit: vi.fn(),
  hasCurrentConsent: vi.fn(),
}))

vi.mock('./cloudbase', () => ({
  callGearFlowApi: mocks.callGearFlowApi,
  ensureCloudbaseInit: mocks.ensureCloudbaseInit,
}))

vi.mock('./consent', () => ({
  hasCurrentConsent: mocks.hasCurrentConsent,
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.hasCurrentConsent.mockReturnValue(true)
})

describe('auth cloud-function adapter', () => {
  it('initializes wx.cloud without requiring a custom login ticket', async () => {
    await expect(signInSilently()).resolves.toBe('')
    expect(mocks.ensureCloudbaseInit).toHaveBeenCalledOnce()
    await expect(signOut()).resolves.toBeUndefined()
  })

  it('requires current consent before a business session', async () => {
    mocks.hasCurrentConsent.mockReturnValue(false)
    await expect(ensureSession()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.ensureCloudbaseInit).not.toHaveBeenCalled()
  })

  it('parses the current user returned by the function', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({
      user: { id: 'u1', nickname: 'Alice', avatarUrl: 'https://example.test/a.png' },
    })
    await expect(fetchCurrentUser()).resolves.toEqual({
      id: 'u1',
      nickname: 'Alice',
      avatarUrl: 'https://example.test/a.png',
    })
  })

  it('passes explicit consent versions during bootstrap', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({
      user: { id: 'u1', nickname: null, avatarUrl: null, isNewUser: true },
    })
    await expect(bootstrapIdentity('1.0.1', '1.0.1')).resolves.toEqual({
      user: { id: 'u1', nickname: null, avatarUrl: null, isNewUser: true },
    })
    expect(mocks.callGearFlowApi).toHaveBeenCalledWith('auth.bootstrap', {
      privacyVersion: '1.0.1',
      termsVersion: '1.0.1',
    })
  })

  it('updates profile through the cloud function', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({ ok: true })
    await updateProfile({ nickname: 'Alice', avatarUrl: '' })
    expect(mocks.callGearFlowApi).toHaveBeenCalledWith('auth.updateProfile', {
      nickname: 'Alice',
      avatarUrl: '',
    })
  })

  it('only reports a successful deletion status', async () => {
    mocks.callGearFlowApi.mockResolvedValueOnce({
      status: 'DELETED',
      deletedAt: '2026-10-07T00:00:00Z',
    })
    await expect(deleteAccount()).resolves.toEqual({ deletedAt: '2026-10-07T00:00:00Z' })
    mocks.callGearFlowApi.mockResolvedValueOnce({ status: 'NOT_FOUND', deletedAt: null })
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
  })
})
