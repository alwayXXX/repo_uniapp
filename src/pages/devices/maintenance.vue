<template>
  <view class="page">
    <view class="card">
      <FormField label="标题" required :error="errors.title">
        <input v-model="form.title" class="input" placeholder="例如：更换电池" maxlength="64" />
      </FormField>

      <FormField label="类型" :error="errors.type">
        <view class="type-row">
          <view
            v-for="option in MAINTENANCE_TYPE_OPTIONS"
            :key="option.value"
            class="type-chip"
            :class="{ active: form.type === option.value }"
            @click="form.type = option.value"
          >
            <text class="type-chip-text">{{ option.label }}</text>
          </view>
        </view>
      </FormField>

      <FormField label="发生日期" required :error="errors.occurredAt">
        <picker mode="date" :value="form.occurredAt" @change="onDateChange">
          <view class="select-field">
            <text class="select-value">{{ form.occurredAt }}</text>
            <text class="select-arrow">›</text>
          </view>
        </picker>
      </FormField>

      <FormField label="费用（元）" :error="errors.cost">
        <input v-model="form.costYuan" class="input" type="digit" placeholder="选填，例如 500.00" />
      </FormField>

      <FormField label="服务商">
        <input v-model="form.vendor" class="input" placeholder="选填" maxlength="128" />
      </FormField>

      <FormField label="备注" :error="errors.notes">
        <textarea v-model="form.notes" class="textarea" placeholder="选填" maxlength="1000" />
      </FormField>
    </view>

    <button class="save-button" :disabled="saving" @click="onSave">
      {{ saving ? '保存中…' : isEdit ? '保存修改' : '保存' }}
    </button>

    <button v-if="isEdit" class="delete-button" :disabled="deleting" @click="askDelete">
      {{ deleting ? '删除中…' : '删除此维护记录' }}
    </button>

    <view v-if="confirmVisible" class="mask" @click="confirmVisible = false">
      <view class="confirm-card" @click.stop>
        <text class="confirm-title">删除维护记录</text>
        <text class="confirm-text">将删除该维护记录及其费用（成本统计同步更新）。</text>
        <view class="confirm-actions">
          <button class="cancel-button" @click="confirmVisible = false">取消</button>
          <button class="danger-button" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中…' : '删除' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  addMaintenance,
  deleteMaintenance,
  listByDevice,
  updateMaintenance,
} from '@/services/maintenance'
import { getDevice } from '@/services/device'
import {
  normalizeMaintenanceForm,
  todayString,
  type MaintenanceFormErrors,
} from '@/validators/maintenance'
import type { MaintenanceFormInput } from '@/types/maintenance'
import { MAINTENANCE_TYPE_OPTIONS } from '@/constants/maintenance'
import FormField from '@/components/FormField.vue'

const isEdit = ref(false)
const recordId = ref('')
let deviceId = ''
const saving = ref(false)
const deleting = ref(false)
const confirmVisible = ref(false)
const errors = ref<MaintenanceFormErrors>({})
/** 设备购买日期：维护发生日期的下限校验上下文 */
const devicePurchaseDate = ref<string | null>(null)

const emptyForm = (): MaintenanceFormInput => ({
  title: '',
  type: 'REPAIR',
  occurredAt: todayString(),
  costYuan: '',
  vendor: '',
  notes: '',
})

const form = ref<MaintenanceFormInput>(emptyForm())

onLoad(async (query) => {
  deviceId = query?.deviceId ?? ''
  const id = query?.id ?? ''
  if (deviceId === '') {
    uni.showToast({ title: '缺少设备上下文', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 600)
    return
  }
  try {
    // 购买日期用于「发生日期不早于购买日期」校验
    const device = await getDevice(deviceId)
    devicePurchaseDate.value = device?.purchaseDate ?? null
  } catch {
    devicePurchaseDate.value = null
  }
  if (id) {
    isEdit.value = true
    recordId.value = id
    try {
      // 编辑模式：重新拉取该设备维护列表定位目标记录
      const records = await listByDevice(deviceId)
      const record = records.find((r) => r.id === id)
      if (!record) {
        uni.showToast({ title: '维护记录不存在', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 600)
        return
      }
      form.value = {
        title: record.title,
        type: record.type,
        occurredAt: record.occurredAt,
        costYuan: record.costCents === null ? '' : (record.costCents / 100).toFixed(2),
        vendor: record.vendor ?? '',
        notes: record.notes ?? '',
      }
    } catch {
      uni.showToast({ title: '加载维护记录失败', icon: 'none' })
    }
  }
})

function onDateChange(event: { detail: { value: string } }): void {
  form.value.occurredAt = event.detail.value
  if (errors.value.occurredAt) delete errors.value.occurredAt
}

async function onSave(): Promise<void> {
  if (saving.value) return
  const normalized = normalizeMaintenanceForm(form.value, devicePurchaseDate.value)
  errors.value = normalized.errors
  if (!normalized.values) {
    uni.showToast({ title: '请检查表单填写', icon: 'none' })
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateMaintenance(recordId.value, normalized.values)
    } else {
      await addMaintenance(deviceId, normalized.values)
    }
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function askDelete(): void {
  confirmVisible.value = true
}

async function confirmDelete(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  try {
    await deleteMaintenance(recordId.value)
    uni.showToast({ title: '已删除', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch {
    uni.showToast({ title: '删除失败，请重试', icon: 'none' })
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-md $gf-space-md $gf-space-xl;
}

.card {
  padding: $gf-space-sm $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.input {
  width: 100%;
  padding: $gf-space-sm;
  font-size: $gf-font-md;
  color: $gf-text-1;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
  box-sizing: border-box;
}

.textarea {
  width: 100%;
  height: 160rpx;
  padding: $gf-space-sm;
  font-size: $gf-font-md;
  color: $gf-text-1;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
  box-sizing: border-box;
}

.select-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $gf-space-sm;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}

.select-value {
  font-size: $gf-font-md;
  color: $gf-text-1;
}

.select-arrow {
  font-size: $gf-font-lg;
  color: $gf-text-4;
}

.type-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: $gf-space-xs;
}

.type-chip {
  padding: 8rpx $gf-space-md;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}

.type-chip.active {
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.type-chip-text {
  font-size: $gf-font-sm;
}

.save-button {
  margin-top: $gf-space-lg;
  background-color: $gf-color-primary;
  color: #ffffff;
  font-size: $gf-font-lg;
}

.save-button[disabled] {
  background-color: $gf-text-4;
  color: #ffffff;
}

.delete-button {
  margin-top: $gf-space-sm;
  color: $gf-color-danger;
  background-color: #ffece8;
  font-size: $gf-font-md;
}

.mask {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
}

.confirm-card {
  width: 560rpx;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.confirm-title {
  font-size: $gf-font-lg;
  font-weight: 600;
  color: $gf-text-1;
}

.confirm-text {
  display: block;
  margin-top: $gf-space-sm;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  flex-direction: row;
  gap: $gf-space-sm;
  margin-top: $gf-space-lg;
}

.confirm-actions button {
  flex: 1;
  font-size: $gf-font-md;
  border-radius: $gf-radius-md;
}

.cancel-button {
  color: $gf-text-2;
  background-color: $gf-bg-page;
}

.danger-button {
  color: #ffffff;
  background-color: $gf-color-danger;
}
</style>
