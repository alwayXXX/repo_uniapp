<template>
  <view class="p11-page">
    <text class="eyebrow">设备 / 处置记录</text><text class="title">出售或报废</text>
    <StatusView :state="state" :error-text="error" @retry="refresh">
      <view v-if="device" class="card">
        <text class="section-title">{{ device.name }}</text>
        <FormField label="处置方式" required
          ><picker
            :range="['已出售', '已报废']"
            :value="status === 'SOLD' ? 0 : 1"
            @change="status = Number($event.detail.value) === 0 ? 'SOLD' : 'DISCARDED'"
            ><view class="input">{{ status === 'SOLD' ? '已出售' : '已报废' }} ›</view></picker
          ></FormField
        >
        <FormField label="处置日期" required :error="formError"
          ><picker
            mode="date"
            :value="date"
            :start="device.purchaseDate || '1970-01-01'"
            :end="todayString()"
            @change="date = $event.detail.value"
            ><view class="input">{{ date }}</view></picker
          ></FormField
        >
        <FormField label="处置收入（元，选填）"
          ><input v-model="amount" class="input" type="digit" placeholder="未获得收入可留空"
        /></FormField>
        <FormField label="处置说明（选填）">
          <textarea
            v-model="notes"
            class="textarea"
            maxlength="1000"
            placeholder="例如回收方式；请勿填写无关个人资料"
          />
        </FormField>
        <text class="hint"
          >保存后更新设备状态和时间线，取消该设备未发送提醒。处置收入独立记录，原购买价格与维护费用保留。</text
        >
        <button class="primary" :disabled="busy" @click="save">
          {{ busy ? '保存中…' : '保存处置记录' }}
        </button>
      </view>
    </StatusView>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import StatusView from '@/components/StatusView.vue'
import FormField from '@/components/FormField.vue'
import { useFeaturePage } from '@/composables/useFeaturePage'
import { getDevice } from '@/services/device'
import { disposeDevice } from '@/services/phase11'
import { todayString, isValidDateString } from '@/utils/date'
import { centsToYuan, yuanToCents } from '@/utils/money'
import type { DeviceDoc } from '@/types/device'
const deviceId = ref('')
const device = ref<DeviceDoc | null>(null)
const status = ref<'SOLD' | 'DISCARDED'>('SOLD')
const date = ref(todayString())
const amount = ref('')
const notes = ref('')
const formError = ref('')
const { state, error, busy, load, action } = useFeaturePage()
function refresh(): Promise<void> {
  return load(
    () => getDevice(deviceId.value),
    (value) => {
      if (!value) throw new Error('设备不存在')
      device.value = value
      status.value = value.status === 'DISCARDED' ? 'DISCARDED' : 'SOLD'
      date.value = value.disposalDate || todayString()
      amount.value = centsToYuan(value.disposalPriceCents)
      notes.value = value.disposalNotes || ''
    },
  )
}
function save(): void {
  formError.value = ''
  const cents = amount.value.trim() ? yuanToCents(amount.value) : null
  if (
    !isValidDateString(date.value) ||
    date.value > todayString() ||
    (device.value?.purchaseDate && date.value < device.value.purchaseDate) ||
    (amount.value.trim() && cents === null)
  ) {
    formError.value = '请检查日期和收入金额'
    return
  }
  void action(async () => {
    await disposeDevice({
      deviceId: deviceId.value,
      status: status.value,
      date: date.value,
      priceCents: cents,
      notes: notes.value,
    })
    uni.showToast({ title: '已保存', icon: 'success' })
    uni.navigateBack()
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
