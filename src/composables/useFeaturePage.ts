import { onScopeDispose, ref } from 'vue'
import { requireCurrentConsent } from '@/services/consent'
import { assertClientRevision, clientRevision } from '@/services/client-state'
import { toAppError } from '@/utils/error'
import { clearPreviewFiles } from '@/services/preview-files'
import type { PageState } from '@/types/api/common'

export function useFeaturePage() {
  const state = ref<PageState>('loading')
  const error = ref('')
  const busy = ref(false)
  let sequence = 0
  onScopeDispose(() => {
    sequence += 1
  })
  async function load<T>(request: () => Promise<T>, apply: (value: T) => void): Promise<void> {
    if (!requireCurrentConsent()) return
    const current = ++sequence
    const revision = clientRevision()
    state.value = 'loading'
    error.value = ''
    try {
      clearPreviewFiles()
      const result = await request()
      assertClientRevision(revision)
      if (current !== sequence) return
      apply(result)
      state.value = 'success'
    } catch (value) {
      if (current !== sequence) return
      const failure = toAppError(value)
      error.value = failure.message
      state.value = failure.code === 'FORBIDDEN' ? 'forbidden' : 'error'
    }
  }
  async function action(request: () => Promise<void>): Promise<void> {
    if (busy.value || !requireCurrentConsent()) return
    busy.value = true
    try {
      await request()
    } catch (value) {
      uni.showToast({ title: toAppError(value).message, icon: 'none' })
    } finally {
      busy.value = false
    }
  }
  return { state, error, busy, load, action }
}
