<template>
  <view class="p11-page">
    <text class="eyebrow">设备 / 私人凭证</text><text class="title">照片与发票</text>
    <text class="hint"
      >仅供本人查阅，保存在国内
      CloudBase，至删除附件、设备或注销账号时清理。建议先遮盖发票上的姓名、地址等无关信息。</text
    >
    <button
      class="primary"
      :disabled="busy || state !== 'success' || items.length >= 10"
      @click="upload"
    >
      {{ busy ? '处理中…' : '从微信文件选择附件' }}
    </button>
    <text class="hint">支持 JPG、PNG、WebP、PDF，每份最多 2 MiB，每台最多 10 份。</text>
    <button :disabled="busy || state !== 'success' || items.length >= 10" @click="uploadPhoto">
      从相册选择照片
    </button>
    <StatusView :state="state" :error-text="error" @retry="refresh">
      <view class="card"
        ><text class="section-title">{{ deviceName }} · {{ items.length }}/10</text>
        <text v-if="items.length === 0" class="hint">还没有附件，点击上方按钮添加凭证。</text>
        <view v-for="item in items" :key="item.id" class="row">
          <view
            ><text>{{ item.name }}</text
            ><text class="hint">{{ Math.ceil(item.size / 1024) }} KiB</text></view
          >
          <button class="compact" :disabled="busy" @click="open(item.id)">查看</button>
          <button class="compact danger" :disabled="busy" @click="remove(item)">删除</button>
        </view>
      </view>
    </StatusView>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import StatusView from '@/components/StatusView.vue'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { getDevice } from '@/services/device'
import {
  chooseAndUploadAttachment,
  deleteAttachment,
  listAttachments,
  openAttachment,
} from '@/services/phase11'
import type { AttachmentItem } from '@/types/api/phase11'
const deviceId = ref('')
const deviceName = ref('')
const items = ref<AttachmentItem[]>([])
const { state, error, busy, load, action } = useFeaturePage()
function refresh(): Promise<void> {
  return load(
    () => Promise.all([getDevice(deviceId.value), listAttachments(deviceId.value)]),
    ([device, attachments]) => {
      if (!device) throw new Error('设备不存在')
      deviceName.value = device.name
      items.value = attachments
    },
  )
}
function upload(): void {
  void action(async () => {
    if (await chooseAndUploadAttachment(deviceId.value)) await refresh()
  })
}
function uploadPhoto(): void {
  void action(async () => {
    if (await chooseAndUploadAttachment(deviceId.value, 'album')) await refresh()
  })
}
function open(id: string): void {
  void action(() => openAttachment(id))
}
function remove(item: AttachmentItem): void {
  uni.showModal({
    title: '删除附件',
    content: `将永久删除「${item.name}」及其云文件，无法恢复。`,
    success: (value) => {
      if (value.confirm)
        void action(async () => {
          await deleteAttachment(item.id)
          await refresh()
        })
    },
  })
}
onLoad((query) => {
  deviceId.value = query?.deviceId || ''
})
onShow(() => {
  void refresh()
})
</script>
<style scoped lang="scss">
@import '@/styles/phase11.scss';
</style>
