<template>
  <view class="gear-picker">
    <view @click="visible = true"><slot /></view>
    <wd-picker
      v-if="mode === 'selector'"
      :visible="visible"
      :model-value="[selectedIndex]"
      :columns="options"
      @update:visible="visible = $event"
      @confirm="confirmOption"
    />
    <wd-datetime-picker
      v-else
      :visible="visible"
      :model-value="selectedDate"
      :type="fields === 'year' ? 'year' : 'date'"
      :min-date="minimum"
      :max-date="maximum"
      @update:visible="visible = $event"
      @confirm="confirmDate"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { isValidDateString } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    mode?: 'selector' | 'date'
    fields?: 'year'
    range?: string[]
    value?: string | number
    start?: string
    end?: string
  }>(),
  {
    mode: 'selector',
    fields: undefined,
    range: () => [],
    value: '',
    start: '1970-01-01',
    end: '2099-12-31',
  },
)
const emit = defineEmits<{ change: [event: { detail: { value: string } }] }>()
const visible = ref(false)
const options = computed(() => props.range.map((label, value) => ({ label, value })))
const selectedIndex = computed(() => {
  const index = Number(props.value)
  return Number.isInteger(index) && index >= 0 && index < props.range.length ? index : 0
})

function parseDate(value: string, endOfYear = false): number | null {
  const date = /^\d{4}$/.test(value) ? `${value}-${endOfYear ? '12-31' : '01-01'}` : value
  if (!isValidDateString(date)) return null
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!, endOfYear ? 23 : 0, endOfYear ? 59 : 0).getTime()
}

const minimum = computed(() => parseDate(props.start) ?? parseDate('1970-01-01')!)
const maximum = computed(() =>
  Math.max(minimum.value, parseDate(props.end, true) ?? parseDate('2099-12-31')!),
)
const selectedDate = computed(() => {
  const value = parseDate(String(props.value)) ?? Date.now()
  return Math.max(minimum.value, Math.min(maximum.value, value))
})

function confirmOption(event: { value: Array<string | number> }): void {
  const index = Number(event.value[0])
  if (Number.isInteger(index) && index >= 0 && index < props.range.length)
    emit('change', { detail: { value: String(index) } })
}

function confirmDate(event: { value: number | string | Array<number | string> }): void {
  if (typeof event.value !== 'number' || !Number.isFinite(event.value)) return
  const date = new Date(event.value)
  if (!Number.isFinite(date.getTime())) return
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  emit('change', { detail: { value: props.fields === 'year' ? year : `${year}-${month}-${day}` } })
}
</script>
