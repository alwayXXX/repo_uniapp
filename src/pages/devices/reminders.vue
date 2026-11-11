<template>
  <view class="p11-page wot-text-text-main">
    <text class="eyebrow">设备 / 订阅提醒</text><text class="title">保修到期提醒</text>
    <StatusView :state="state" :error-text="error" @retry="refresh">
      <view class="card wot-bg-filled-oppo wot-rounded-lg"
        ><text class="section-title">{{ deviceName }}</text>
        <text class="hint">{{
          warrantyEnd ? `保修到期：${warrantyEnd}` : '先在设备编辑页填写保修信息。'
        }}</text>
        <text v-if="config?.reason === 'PLATFORM_UNAVAILABLE'" class="hint"
          >微信订阅服务暂不可用，请稍后重试；下方已有待发任务仍可取消。</text
        >
        <text v-else-if="!config?.available" class="hint"
          >微信订阅模板尚未配置。开发者需在微信后台添加设备保修到期模板后才能开启；其他功能可正常使用。</text
        >
        <FormField label="提醒日期"
          ><GearPicker
            mode="date"
            :value="remindOn"
            :start="tomorrow"
            :end="warrantyEnd >= tomorrow ? warrantyEnd : tomorrow"
            @change="remindOn = $event.detail.value"
            ><view class="input">{{ remindOn }} ›</view></GearPicker
          ></FormField
        >
        <text class="hint"
          >只在你主动授权后计划一次提醒，可取消尚未发送的任务。微信拒绝授权时不会创建计划。</text
        >
        <wd-button
          type="primary"
          class="primary"
          :disabled="busy || !config?.available || warrantyEnd < tomorrow || !active"
          @click="subscribe"
        >
          {{ busy ? '处理中…' : '授权并设置一次提醒' }}
        </wd-button>
        <text v-if="!active" class="hint">已出售或报废的设备不安排提醒。</text>
      </view>
      <view class="card wot-bg-filled-oppo wot-rounded-lg"
        ><text class="section-title">提醒记录</text
        ><text v-if="!items.length" class="hint">暂无提醒计划</text>
        <view v-for="item in items" :key="item.id" class="row"
          ><view
            ><text>{{ item.remindOn }}</text
            ><text class="hint">{{ labels[item.status] }}</text></view
          ><wd-button
            v-if="item.status === 'PENDING'"
            type="primary"
            variant="soft"
            class="compact"
            :disabled="busy"
            @click="cancel(item.id)"
          >
            取消
          </wd-button></view
        >
      </view>
    </StatusView>
  </view>
</template>
<script setup lang="ts">
import GearPicker from '@/components/GearPicker.vue'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import StatusView from '@/components/StatusView.vue'
import FormField from '@/components/FormField.vue'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { getDevice } from '@/services/device'
import { getWarranty } from '@/services/warranty'
import {
  cancelReminder,
  getReminderConfig,
  listReminders,
  subscribeReminder,
} from '@/services/phase11'
import { localDateString } from '@/utils/statistics'
import { isValidDateString } from '@/utils/date'
import type { ReminderConfig, ReminderItem, ReminderStatus } from '@/types/api/phase11'
const nextDay = new Date()
nextDay.setDate(nextDay.getDate() + 1)
const tomorrow = localDateString(nextDay)
const deviceId = ref('')
const deviceName = ref('')
const warrantyEnd = ref('')
const remindOn = ref(tomorrow)
const active = ref(true)
const config = ref<ReminderConfig | null>(null)
const items = ref<ReminderItem[]>([])
const labels: Record<ReminderStatus, string> = {
  PENDING: '待发送',
  SENDING: '发送中',
  SENT: '已发送',
  CANCELLED: '已取消',
  FAILED: '发送失败，可重新授权',
  UNKNOWN: '结果待确认，不自动重发',
}
const { state, error, busy, load, action } = useFeaturePage()
function refresh(): Promise<void> {
  return load(
    () =>
      Promise.all([
        getDevice(deviceId.value),
        getWarranty(deviceId.value),
        getReminderConfig(),
        listReminders(deviceId.value),
      ]),
    ([device, warranty, settings, reminders]) => {
      if (!device) throw new Error('设备不存在')
      deviceName.value = device.name
      active.value = !['SOLD', 'DISCARDED'].includes(device.status)
      warrantyEnd.value = warranty?.endDate || ''
      config.value = settings
      items.value = reminders
    },
  )
}
function subscribe(): void {
  const templateId = config.value?.templateId
  if (!templateId) return
  if (
    !isValidDateString(remindOn.value) ||
    remindOn.value < tomorrow ||
    remindOn.value > warrantyEnd.value
  ) {
    uni.showToast({ title: '请选择明天至保修到期之间的日期', icon: 'none' })
    return
  }
  void action(async () => {
    const accepted = await subscribeReminder(deviceId.value, remindOn.value, templateId)
    uni.showToast({ title: accepted ? '已设置一次提醒' : '未授权，不创建提醒', icon: 'none' })
    if (accepted) await refresh()
  })
}
function cancel(id: string): void {
  void action(async () => {
    await cancelReminder(id)
    await refresh()
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
