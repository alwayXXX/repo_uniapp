<template>
  <view class="p11-page">
    <text class="eyebrow">我的 / 数据保护</text>
    <text class="title">备份与恢复</text>
    <text class="hint"
      >备份包含当前设备、保修、维护、时间线和附件。文件未经加密，请保存到你信任的位置。</text
    >
    <view class="card">
      <text class="section-title">导出备份</text>
      <text class="hint">单份文件最多 20 MiB、1000 台设备。导出时请暂时不要修改设备或附件。</text>
      <button class="primary" :disabled="busy" @click="confirmExport">
        {{ busy && mode === 'export' ? '正在准备备份…' : '生成备份' }}
      </button>
      <text v-if="prepared" class="hint"
        >备份已生成，请点击下方按钮分享；离开页面后需重新生成。</text
      >
      <button v-if="prepared" class="primary" :disabled="busy" @click="sharePrepared">
        分享备份
      </button>
    </view>
    <view class="card">
      <text class="section-title">从备份恢复</text>
      <text class="hint"
        >先从微信聊天文件选择备份。已有设备会跳过，不覆盖原数据；微信提醒需要重新授权。</text
      >
      <button :disabled="busy" @click="pickBackup">
        {{ busy && mode === 'preview' ? '正在检查…' : '选择备份文件' }}
      </button>
      <view v-if="bundle && preview.length" class="preview">
        <text class="section-title">恢复预览</text>
        <text class="hint"
          >备份共 {{ bundle.snapshot.devices.length }} 台设备、{{
            bundle.files.length
          }}
          个附件。</text
        >
        <text class="hint"
          >可新增 {{ count('create') }} 台，可继续恢复 {{ count('resume') }} 台，跳过已有设备
          {{ count('skip') }} 台，无法恢复 {{ count('conflict') }} 台。</text
        >
        <text v-for="item in problemItems" :key="item.id" class="problem"
          >{{ item.name }}：{{
            item.state === 'skip' ? '已有设备，将跳过' : '分类不可用或副本已删除'
          }}</text
        >
        <text v-if="problemCount > problemItems.length" class="hint"
          >另有 {{ problemCount - problemItems.length }} 台已跳过或无法恢复。</text
        >
        <button
          class="primary"
          :disabled="busy || count('create') + count('resume') === 0"
          @click="confirmRestore"
        >
          确认恢复
        </button>
      </view>
      <text v-else-if="bundle && !preview.length" class="hint">这份备份中没有设备。</text>
    </view>
    <text v-if="message" class="result">{{ message }}</text>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import { requireCurrentConsent } from '@/services/consent'
import {
  chooseAccountBackup,
  prepareAccountBackup,
  previewAccountRestore,
  restoreAccountBackup,
  sharePreparedAccountBackup,
  type PreparedAccountBackup,
} from '@/services/backup'
import { toAppError } from '@/utils/error'
import type { BackupBundle, RestorePreviewItem, RestorePreviewState } from '@/types/api/backup'

const bundle = shallowRef<BackupBundle | null>(null)
const prepared = shallowRef<PreparedAccountBackup | null>(null)
const preview = ref<RestorePreviewItem[]>([])
const busy = ref(false)
const mode = ref<'export' | 'share' | 'preview' | 'restore' | ''>('')
const message = ref('')
const error = ref('')
let active = true
let visibilityRevision = 0

function count(state: RestorePreviewState): number {
  return preview.value.filter((item) => item.state === state).length
}
const problemCount = computed(() => count('skip') + count('conflict'))
const problemItems = computed(() =>
  preview.value
    .filter((item) => item.state === 'skip' || item.state === 'conflict')
    .slice(0, 10)
    .map((item) => ({
      ...item,
      name: String(
        bundle.value?.snapshot.devices.find((row) => row.id === item.id)?.name || '设备',
      ),
    })),
)

async function run(
  task: () => Promise<void>,
  nextMode: 'export' | 'share' | 'preview' | 'restore',
): Promise<void> {
  if (busy.value || !requireCurrentConsent()) return
  busy.value = true
  mode.value = nextMode
  message.value = ''
  error.value = ''
  try {
    await task()
  } catch (value) {
    if (active)
      error.value =
        nextMode === 'restore'
          ? `${toAppError(value).message}。恢复可能尚未完成，可再次点击确认恢复继续。`
          : toAppError(value).message
  } finally {
    if (active) {
      busy.value = false
      mode.value = ''
    }
  }
}

function confirmExport(): void {
  uni.showModal({
    title: '导出设备备份',
    content: '备份可能包含序列号、价格、照片和发票，文件未加密。请仅分享或保存到你信任的位置。',
    confirmText: '继续',
    success: (result) => {
      if (!result.confirm) return
      void run(async () => {
        prepared.value = null
        const revision = visibilityRevision
        const backup = await prepareAccountBackup()
        if (active && revision === visibilityRevision) prepared.value = backup
      }, 'export')
    },
  })
}

function sharePrepared(): void {
  const selected = prepared.value
  if (!selected) return
  void run(async () => {
    prepared.value = null
    const outcome = await sharePreparedAccountBackup(selected)
    if (active)
      message.value =
        outcome === 'cancelled'
          ? '已取消分享，未生成已保存的备份。'
          : '微信已完成分享，请确认接收并妥善保管备份文件。'
  }, 'share')
}

function pickBackup(): void {
  void run(async () => {
    bundle.value = null
    preview.value = []
    const chosen = await chooseAccountBackup()
    if (!chosen || !active) return
    const checked = await previewAccountRestore(chosen)
    if (!active) return
    bundle.value = chosen
    preview.value = checked
  }, 'preview')
}

function confirmRestore(): void {
  const selected = bundle.value
  if (!selected) return
  uni.showModal({
    title: '确认恢复备份',
    content:
      '只新增缺少的设备和记录，不覆盖已有设备。恢复中断后可重新选择同一文件继续。微信提醒不会自动恢复。',
    confirmText: '开始恢复',
    success: (value) => {
      if (!value.confirm) return
      void run(async () => {
        const result = await restoreAccountBackup(
          selected,
          preview.value,
          (done, total) => {
            if (active) message.value = `正在恢复 ${done}/${total} 台设备…`
          },
          () => active,
        )
        if (!active) return
        message.value = `恢复完成：新增 ${result.devices} 台设备、${result.records} 条记录或附件，跳过 ${result.skipped} 台，${result.conflicts} 项有冲突。`
        bundle.value = null
        preview.value = []
      }, 'restore')
    },
  })
}

onShow(() => {
  requireCurrentConsent()
})
onHide(() => {
  visibilityRevision++
  prepared.value = null
})
onUnload(() => {
  active = false
  visibilityRevision++
  prepared.value = null
  bundle.value = null
  preview.value = []
})
</script>

<style scoped lang="scss">
@import '@/styles/phase11.scss';
.preview {
  margin-top: $gf-space-md;
}
.problem,
.result,
.error {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  line-height: 1.5;
}
.problem {
  color: $gf-text-2;
}
.result {
  color: $gf-color-success;
}
.error {
  color: $gf-color-danger;
}
</style>
