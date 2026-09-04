<template>
  <view class="page">
    <view class="page-intro">
      <text class="eyebrow">设备资产 / {{ isEdit ? '编辑' : '新增' }}</text>
      <text class="page-title">{{ isEdit ? '编辑设备' : '添加设备' }}</text>
      <text class="page-subtitle">记录关键资料，后续维护和统计会自动关联。</text>
    </view>

    <view class="card">
      <view class="section-heading">
        <view>
          <text class="section-title">基本信息</text>
          <text class="section-caption">设备识别与资产归属</text>
        </view>
        <text class="section-index">01</text>
      </view>

      <FormField label="分类" required :error="errors.categoryId">
        <view class="select-field" @click="showCategorySheet = true">
          <text :class="categoryName ? 'select-value' : 'select-placeholder'">
            {{ categoryName || '请选择分类' }}
          </text>
          <text class="select-arrow">›</text>
        </view>
      </FormField>

      <FormField label="名称" required :error="errors.name">
        <input v-model="form.name" class="input" placeholder="例如：MacBook Pro" maxlength="64" />
      </FormField>

      <FormField label="状态">
        <view class="status-row">
          <view
            v-for="option in DEVICE_STATUS_OPTIONS"
            :key="option.value"
            class="status-chip"
            :class="{ active: form.status === option.value }"
            @click="form.status = option.value"
          >
            <text class="status-chip-text">{{ option.label }}</text>
          </view>
        </view>
      </FormField>

      <FormField label="品牌">
        <input v-model="form.brand" class="input" placeholder="选填" maxlength="64" />
      </FormField>

      <FormField label="型号">
        <input v-model="form.model" class="input" placeholder="选填" maxlength="128" />
      </FormField>

      <FormField label="序列号" :error="errors.serialNumber">
        <input v-model="form.serialNumber" class="input" placeholder="选填" maxlength="128" />
      </FormField>

      <FormField label="购买日期" :error="errors.purchaseDate">
        <picker mode="date" :value="form.purchaseDate" @change="onPurchaseDateChange">
          <view class="select-field">
            <text :class="form.purchaseDate ? 'select-value' : 'select-placeholder'">
              {{ form.purchaseDate || '选择日期（可选）' }}
            </text>
            <text class="select-arrow">›</text>
          </view>
        </picker>
      </FormField>

      <FormField label="购买渠道">
        <input
          v-model="form.purchaseChannel"
          class="input"
          placeholder="选填，例如 Apple Store"
          maxlength="128"
        />
      </FormField>

      <FormField label="购买价格（元）" :error="errors.purchasePrice">
        <input
          v-model="form.purchasePriceYuan"
          class="input"
          type="digit"
          placeholder="选填，例如 9999.00"
        />
      </FormField>

      <FormField label="备注" :error="errors.notes">
        <textarea v-model="form.notes" class="textarea" placeholder="选填" maxlength="1000" />
      </FormField>
    </view>

    <view class="card">
      <view class="section-heading">
        <view>
          <text class="section-title">保修信息</text>
          <text class="section-caption">选填，填写结束日期后自动计算状态</text>
        </view>
        <text class="section-index">02</text>
      </view>
      <FormField label="保修开始日期" :error="errors.warrantyDates">
        <picker mode="date" :value="warrantyStart" @change="onWarrantyStartChange">
          <view class="select-field">
            <text :class="warrantyStart ? 'select-value' : 'select-placeholder'">
              {{ warrantyStart || '选择日期' }}
            </text>
            <text class="select-arrow">›</text>
          </view>
        </picker>
      </FormField>
      <FormField label="保修结束日期" :error="errors.warrantyDates">
        <picker mode="date" :value="warrantyEnd" @change="onWarrantyEndChange">
          <view class="select-field">
            <text :class="warrantyEnd ? 'select-value' : 'select-placeholder'">
              {{ warrantyEnd || '选择日期（填写后自动计算保修状态）' }}
            </text>
            <text class="select-arrow">›</text>
          </view>
        </picker>
      </FormField>
      <FormField label="保修提供方">
        <input
          v-model="warrantyProvider"
          class="input"
          placeholder="选填，例如 Apple"
          maxlength="128"
        />
      </FormField>
    </view>

    <view class="action-area">
      <button class="save-button" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : isEdit ? '保存修改' : '保存设备' }}
      </button>
      <text class="action-note">信息只会保存在你的 GearFlow 账户中</text>
    </view>

    <view v-if="showCategorySheet" class="sheet-mask" @click="showCategorySheet = false">
      <view class="sheet" @click.stop>
        <text class="sheet-title">选择分类</text>
        <scroll-view scroll-y class="sheet-list">
          <view
            v-for="category in categories"
            :key="category.id"
            class="sheet-option"
            :class="{ active: form.categoryId === category.id }"
            @click="selectCategory(category.id)"
          >
            <text class="sheet-option-name">{{ category.name }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDeviceStore } from '@/stores/device'
import { getDevice, saveDeviceWithWarranty } from '@/services/device'
import { getWarranty } from '@/services/warranty'
import { ensureSession } from '@/services/auth'
import { normalizeDeviceForm, type DeviceFormErrors } from '@/validators/device'
import { centsToYuan } from '@/utils/money'
import { isValidDateString } from '@/utils/date'
import { DEVICE_STATUS_OPTIONS } from '@/constants/device'
import FormField from '@/components/FormField.vue'
import type { DeviceCategory, DeviceFormInput } from '@/types/device'

const store = useDeviceStore()
const categories = ref<DeviceCategory[]>([])
const isEdit = ref(false)
const editId = ref('')
const saving = ref(false)
const showCategorySheet = ref(false)
const errors = ref<DeviceFormErrors>({})

const warrantyStart = ref('')
const warrantyEnd = ref('')
const warrantyProvider = ref('')

const emptyForm = (): DeviceFormInput => ({
  categoryId: '',
  name: '',
  status: 'IN_USE',
  brand: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseChannel: '',
  purchasePriceYuan: '',
  notes: '',
})

const form = ref<DeviceFormInput>(emptyForm())

const categoryName = computed(() => {
  const found = categories.value.find((c) => c.id === form.value.categoryId)
  return found ? found.name : ''
})

onLoad(async (query) => {
  categories.value = await store.ensureCategories()
  const id = query?.id ?? ''
  if (id) {
    isEdit.value = true
    editId.value = id
    await ensureSession()
    const device = await getDevice(id)
    if (!device) {
      uni.showToast({ title: '设备不存在或已被删除', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 600)
      return
    }
    form.value = {
      categoryId: device.categoryId ?? '',
      name: device.name,
      status: device.status,
      brand: device.brand ?? '',
      model: device.model ?? '',
      serialNumber: device.serialNumber ?? '',
      purchaseDate: device.purchaseDate ?? '',
      purchaseChannel: device.purchaseChannel ?? '',
      purchasePriceYuan: centsToYuan(device.purchasePriceCents),
      notes: device.notes ?? '',
    }
    try {
      const warranty = await getWarranty(id)
      if (warranty) {
        warrantyStart.value = warranty.startDate ?? ''
        warrantyEnd.value = warranty.endDate
        warrantyProvider.value = warranty.provider ?? ''
      }
    } catch {
      // 保修信息读取失败不阻塞表单
    }
  }
})

function onWarrantyStartChange(event: { detail: { value: string } }): void {
  warrantyStart.value = event.detail.value
  if (errors.value.warrantyDates) delete errors.value.warrantyDates
}

function onWarrantyEndChange(event: { detail: { value: string } }): void {
  warrantyEnd.value = event.detail.value
  if (errors.value.warrantyDates) delete errors.value.warrantyDates
}

/** 保修校验：日期必须成对；结束不得早于开始 */
function validateWarranty(): string | undefined {
  const hasStart = warrantyStart.value !== ''
  const hasEnd = warrantyEnd.value !== ''
  if (hasStart !== hasEnd) {
    return '保修日期需成对填写，或全部清空'
  }
  if (hasStart && !isValidDateString(warrantyStart.value)) {
    return '保修开始日期格式无效'
  }
  if (hasEnd && !isValidDateString(warrantyEnd.value)) {
    return '保修结束日期格式无效'
  }
  if (hasStart && hasEnd && warrantyEnd.value < warrantyStart.value) {
    return '保修结束日期不能早于开始日期'
  }
  return undefined
}

function selectCategory(id: string): void {
  form.value.categoryId = id
  if (errors.value.categoryId) delete errors.value.categoryId
  showCategorySheet.value = false
}

function onPurchaseDateChange(event: { detail: { value: string } }): void {
  form.value.purchaseDate = event.detail.value
  if (errors.value.purchaseDate) delete errors.value.purchaseDate
}

async function onSave(): Promise<void> {
  if (saving.value) return
  const normalized = normalizeDeviceForm(form.value)
  const warrantyError = validateWarranty()
  errors.value = {
    ...normalized.errors,
    ...(warrantyError ? { warrantyDates: warrantyError } : {}),
  }
  if (!normalized.values || warrantyError) {
    uni.showToast({ title: '请检查表单填写', icon: 'none' })
    return
  }
  saving.value = true
  try {
    await saveDeviceWithWarranty(isEdit.value ? editId.value : null, normalized.values, {
      mode: warrantyEnd.value === '' ? 'CLEAR' : 'SET',
      startDate: warrantyStart.value === '' ? null : warrantyStart.value,
      endDate: warrantyEnd.value === '' ? null : warrantyEnd.value,
      provider: warrantyProvider.value.trim() === '' ? null : warrantyProvider.value.trim(),
    })

    uni.showToast({ title: '已保存', icon: 'success' })
    await store.loadFirst()
    setTimeout(() => uni.navigateBack(), 500)
  } catch {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  padding: 24rpx $gf-space-md calc(64rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.page-intro {
  padding: 8rpx 8rpx 20rpx;
}

.eyebrow {
  display: block;
  font-size: $gf-font-xs;
  font-weight: 600;
  color: $gf-color-primary;
}

.page-title {
  display: block;
  margin-top: 8rpx;
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.25;
  color: $gf-text-1;
}

.page-subtitle {
  display: block;
  max-width: 620rpx;
  margin-top: 8rpx;
  font-size: $gf-font-sm;
  line-height: 1.5;
  color: $gf-text-3;
}

.card {
  padding: 12rpx $gf-space-lg 18rpx;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
  border: 1rpx solid $gf-line;
  box-shadow: $gf-shadow-sm;
  margin-bottom: $gf-space-md;
  box-sizing: border-box;
}

.section-heading {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12rpx 0 2rpx;
}

.section-heading > view {
  min-width: 0;
}

.section-title,
.section-caption {
  display: block;
}

.section-title {
  font-size: $gf-font-md;
  font-weight: 700;
  line-height: 1.35;
  color: $gf-text-1;
}

.section-caption {
  margin-top: 4rpx;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
}

.section-index {
  font-size: $gf-font-xs;
  font-weight: 700;
  color: $gf-text-4;
}

.card-title {
  display: block;
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
}

.input {
  width: 100%;
  display: block;
  height: $gf-control-height;
  min-height: $gf-control-height;
  padding: 0 24rpx;
  font-size: $gf-font-md;
  line-height: $gf-control-height;
  color: $gf-text-1;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-control-radius;
  box-sizing: border-box;
  overflow: hidden;
}

.textarea {
  width: 100%;
  display: block;
  min-height: 176rpx;
  height: 176rpx;
  padding: 20rpx 24rpx;
  font-size: $gf-font-md;
  line-height: 1.5;
  color: $gf-text-1;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-control-radius;
  box-sizing: border-box;
  overflow: hidden;
}

.select-field {
  width: 100%;
  min-height: $gf-control-height;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 20rpx 0 24rpx;
  background-color: $gf-bg-card;
  border: 1rpx solid $gf-line;
  border-radius: $gf-control-radius;
  box-sizing: border-box;
}

.select-value,
.select-placeholder {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-md;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.select-value {
  color: $gf-text-1;
}

.select-placeholder {
  font-size: $gf-font-md;
  color: $gf-text-3;
}

.select-arrow {
  width: 28rpx;
  margin-left: 12rpx;
  font-size: 36rpx;
  line-height: 1;
  color: $gf-text-3;
  text-align: center;
}

.status-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 12rpx;
}

.status-chip {
  flex: 1 1 132rpx;
  min-width: 132rpx;
  min-height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10rpx;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border: 1rpx solid transparent;
  border-radius: $gf-control-radius;
  box-sizing: border-box;
}

.status-chip.active {
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
  border-color: rgba(26, 115, 232, 0.24);
}

.status-chip-text {
  font-size: $gf-font-sm;
  line-height: 1.3;
  white-space: nowrap;
}

.action-area {
  margin-top: 8rpx;
}

.save-button {
  width: 100%;
  min-height: 92rpx;
  margin: 0;
  padding: 0 $gf-space-lg;
  background-color: $gf-color-primary;
  color: #ffffff;
  font-size: $gf-font-lg;
  font-weight: 600;
  line-height: 92rpx;
  border-radius: $gf-control-radius;
}

.save-button[disabled] {
  background-color: $gf-text-4;
  color: #ffffff;
}

.action-note {
  display: block;
  margin-top: 12rpx;
  font-size: $gf-font-xs;
  line-height: 1.4;
  color: $gf-text-3;
  text-align: center;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  background-color: rgba(0, 0, 0, 0.45);
}

.sheet {
  width: 100%;
  max-height: 70vh;
  padding: $gf-space-lg $gf-space-lg calc($gf-space-lg + env(safe-area-inset-bottom));
  background-color: $gf-bg-card;
  border-top: 1rpx solid $gf-line;
  border-radius: 20rpx 20rpx 0 0;
  box-sizing: border-box;
}

.sheet-title {
  display: block;
  margin-bottom: $gf-space-sm;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
  text-align: center;
}

.sheet-list {
  max-height: 50vh;
}

.sheet-option {
  min-height: 84rpx;
  display: flex;
  align-items: center;
  padding: 0 $gf-space-sm;
  border-bottom: 1rpx solid $gf-line;
  box-sizing: border-box;
}

.sheet-option.active .sheet-option-name {
  color: $gf-color-primary;
  font-weight: 600;
}

.sheet-option-name {
  min-width: 0;
  font-size: $gf-font-md;
  color: $gf-text-1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
