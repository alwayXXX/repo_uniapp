<template>
  <view class="page">
    <view class="card">
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

    <button class="save-button" :disabled="saving" @click="onSave">
      {{ saving ? '保存中…' : isEdit ? '保存修改' : '保存' }}
    </button>

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
import { createDevice, getDevice, updateDevice } from '@/services/device'
import { normalizeDeviceForm, type DeviceFormErrors } from '@/validators/device'
import { centsToYuan } from '@/utils/money'
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
  }
})

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
  errors.value = normalized.errors
  if (!normalized.values) {
    uni.showToast({ title: '请检查表单填写', icon: 'none' })
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateDevice(editId.value, normalized.values)
    } else {
      await createDevice(normalized.values)
    }
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

.select-placeholder {
  font-size: $gf-font-md;
  color: $gf-text-3;
}

.select-arrow {
  font-size: $gf-font-lg;
  color: $gf-text-4;
}

.status-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: $gf-space-xs;
}

.status-chip {
  padding: 8rpx $gf-space-md;
  font-size: $gf-font-sm;
  color: $gf-text-2;
  background-color: $gf-bg-page;
  border-radius: $gf-radius-md;
}

.status-chip.active {
  color: $gf-color-primary;
  background-color: $gf-color-primary-weak;
}

.status-chip-text {
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
  border-radius: $gf-radius-lg $gf-radius-lg 0 0;
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
  padding: $gf-space-md $gf-space-sm;
  border-bottom: 1rpx solid $gf-line;
}

.sheet-option.active .sheet-option-name {
  color: $gf-color-primary;
  font-weight: 600;
}

.sheet-option-name {
  font-size: $gf-font-md;
  color: $gf-text-1;
}
</style>
