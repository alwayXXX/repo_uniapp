import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ensureSession, signInSilently, signOut } from './auth'
import { invalidateClientRequests } from './client-state'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sdkSignOut: vi.fn(),
  customTicket: vi.fn(),
  consent: vi.fn(),
}))
vi.mock('./consent', () => ({ hasCurrentConsent: mocks.consent }))
vi.mock('./cloudbase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cloudbase')>()),
  getAuth: () => ({
    getSession: mocks.getSession,
    signOut: mocks.sdkSignOut,
    signInWithCustomTicket: mocks.customTicket,
  }),
}))

interface LoginOptions {
  success(result: { code: string }): void
}
interface RequestOptions {
  success(result: { data: unknown }): void
}
const login = vi.fn<(options: LoginOptions) => void>()
const request = vi.fn<(options: RequestOptions) => void>()
const signedIn = { data: { session: { user: { id: 'synthetic-identity' } } }, error: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.consent.mockReturnValue(true)
  mocks.sdkSignOut.mockResolvedValue({ data: {}, error: null })
  mocks.getSession.mockResolvedValue(signedIn)
  mocks.customTicket.mockResolvedValue(signedIn)
  login.mockImplementation((options) => options.success({ code: 'synthetic-code' }))
  request.mockImplementation((options) =>
    options.success({ data: { ok: true, ticket: 'synthetic-ticket' } }),
  )
  vi.stubGlobal('uni', { login, request })
})
afterEach(() => vi.unstubAllGlobals())

describe('session refresh and logout races', () => {
  it('does not access authentication before current consent', async () => {
    mocks.consent.mockReturnValue(false)
    await expect(ensureSession()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(login).not.toHaveBeenCalled()
  })

  it('reuses a valid SDK session without exchanging a new ticket', async () => {
    await ensureSession()
    expect(login).not.toHaveBeenCalled()
    expect(mocks.customTicket).not.toHaveBeenCalled()
  })

  it('does not trust a session returned alongside an SDK error', async () => {
    mocks.getSession.mockResolvedValueOnce({
      ...signedIn,
      error: { message: 'synthetic session error' },
    })
    await ensureSession()
    expect(mocks.customTicket).toHaveBeenCalledOnce()
  })

  it('refreshes an anonymous session through the WeChat login channel', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'synthetic-anonymous', is_anonymous: true } } },
      error: null,
    })
    await ensureSession()
    expect(mocks.customTicket).toHaveBeenCalledOnce()
  })

  it('reports an SDK sign-out error envelope without exposing its details', async () => {
    mocks.sdkSignOut.mockResolvedValueOnce({
      data: null,
      error: { message: 'synthetic sensitive SDK context' },
    })
    await expect(signOut()).rejects.toMatchObject({
      message: '本机登录状态清理失败，请重试',
    })
  })

  it('does not exchange a ticket if clearing the previous session fails', async () => {
    mocks.sdkSignOut.mockResolvedValueOnce({
      data: null,
      error: { message: 'synthetic sign-out failure' },
    })
    await expect(signInSilently()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    expect(mocks.customTicket).not.toHaveBeenCalled()
  })

  it('coalesces simultaneous missing-session refreshes into one login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await Promise.all([ensureSession(), ensureSession()])
    expect(login).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', data: { code: 'synthetic-code' } }),
    )
    expect(mocks.customTicket).toHaveBeenCalledOnce()
  })

  it('does not revoke a nonexistent token during a first login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mocks.sdkSignOut.mockResolvedValue({
      data: {},
      error: { message: 'synthetic missing token' },
    })
    expect(await signInSilently()).toBe('synthetic-identity')
    expect(mocks.sdkSignOut).not.toHaveBeenCalled()
    expect(mocks.customTicket).toHaveBeenCalledOnce()
  })

  it('blocks a late HTTP ticket after logout and ends the SDK session', async () => {
    const pendingResponse = deferred<unknown>()
    request.mockImplementationOnce((options) => {
      void pendingResponse.promise.then((data) => options.success({ data }))
    })
    const pendingLogin = signInSilently()
    const rejected = expect(pendingLogin).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await flushPromises()
    invalidateClientRequests()
    const ending = signOut()
    pendingResponse.resolve({ ok: true, ticket: 'synthetic-ticket' })
    await rejected
    await ending
    expect(mocks.customTicket).not.toHaveBeenCalled()
    expect(mocks.sdkSignOut).toHaveBeenCalledOnce()
  })

  it('waits for an in-progress ticket exchange before final SDK sign-out', async () => {
    const pendingExchange = deferred<typeof signedIn>()
    mocks.customTicket.mockReturnValueOnce(pendingExchange.promise)
    const pendingLogin = signInSilently()
    const rejected = expect(pendingLogin).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await flushPromises()
    expect(mocks.customTicket).toHaveBeenCalledOnce()
    invalidateClientRequests()
    const ending = signOut()
    expect(mocks.sdkSignOut).toHaveBeenCalledOnce()
    pendingExchange.resolve(signedIn)
    await rejected
    await ending
    expect(mocks.sdkSignOut).toHaveBeenCalledTimes(2)
  })

  it('rejects a session lookup that returns after logout', async () => {
    const lookup = deferred<typeof signedIn>()
    mocks.getSession.mockReturnValueOnce(lookup.promise)
    const pending = ensureSession()
    const rejected = expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    invalidateClientRequests()
    lookup.resolve(signedIn)
    await rejected
    expect(login).not.toHaveBeenCalled()
  })

  it('does not treat an SDK error envelope as a successful ticket exchange', async () => {
    mocks.customTicket.mockResolvedValueOnce({
      ...signedIn,
      error: { message: 'synthetic failure' },
    })
    await expect(signInSilently()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
