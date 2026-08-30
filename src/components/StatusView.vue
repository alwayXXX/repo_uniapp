<template>
  <view v-if="state === 'loading'" class="status-view">
    <StatusLoading :text="loadingText" />
  </view>

  <view v-else-if="state === 'empty'" class="status-view">
    <slot name="empty">
      <StatusEmpty :title="emptyTitle" :hint="emptyHint">
        <template v-if="$slots['empty-action']" #action>
          <slot name="empty-action" />
        </template>
      </StatusEmpty>
    </slot>
  </view>

  <view v-else-if="state === 'error' || state === 'forbidden'" class="status-view">
    <slot name="error">
      <StatusError
        :text="
          errorText ||
          (state === 'forbidden' ? ERROR_MESSAGES.FORBIDDEN : ERROR_MESSAGES.INTERNAL_ERROR)
        "
        :retryable="retryable"
        :loading="retryLoading"
        @retry="emit('retry')"
      />
    </slot>
  </view>

  <!-- success / idle 渲染业务内容；idle 交给页面自行决定初始展示 -->
  <slot v-else />
</template>

<script setup lang="ts">
import StatusEmpty from './StatusEmpty.vue'
import StatusError from './StatusError.vue'
import StatusLoading from './StatusLoading.vue'
import { ERROR_MESSAGES } from '@/constants/error-messages'
import type { PageState } from '@/types/api/common'

/**
 * 统一状态视图：以 PageState 驱动 Loading / Empty / Error / Forbidden 渲染，
 * success 与 idle 渲染默认插槽内容。所有列表与表单页面复用（AGENTS.md 状态与错误处理）。
 */
withDefaults(
  defineProps<{
    state: PageState
    loadingText?: string
    emptyTitle?: string
    emptyHint?: string
    errorText?: string
    retryable?: boolean
    retryLoading?: boolean
  }>(),
  {
    loadingText: '加载中…',
    emptyTitle: '暂无数据',
    emptyHint: '',
    errorText: '',
    retryable: true,
    retryLoading: false,
  },
)

const emit = defineEmits<{ retry: [] }>()
</script>
