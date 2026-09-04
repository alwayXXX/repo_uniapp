<template>
  <view class="timeline-list">
    <view v-for="(event, index) in items" :key="event.id" class="timeline-item">
      <view class="timeline-rail">
        <view class="timeline-dot" :class="event.eventType.toLowerCase()" />
        <view v-if="index < items.length - 1" class="timeline-line" />
      </view>

      <view class="timeline-content">
        <view class="timeline-head">
          <text class="timeline-title">{{ event.title }}</text>
          <text class="timeline-date">{{ event.eventDate }}</text>
        </view>
        <text v-if="event.description" class="timeline-description">
          {{ event.description }}
        </text>
        <text v-if="changedSummary(event)" class="timeline-changes">
          {{ changedSummary(event) }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { summarizeChangedFields } from '@/utils/timeline'
import type { DeviceTimelineEvent } from '@/types/timeline'

defineProps<{ items: DeviceTimelineEvent[] }>()

function changedSummary(event: DeviceTimelineEvent): string {
  return summarizeChangedFields(event.payload.changedFields)
}
</script>

<style scoped lang="scss">
.timeline-list {
  padding-top: $gf-space-xs;
}

.timeline-item {
  display: flex;
  flex-direction: row;
  min-height: 112rpx;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 32rpx;
  flex-shrink: 0;
}

.timeline-dot {
  width: 16rpx;
  height: 16rpx;
  margin-top: 8rpx;
  background-color: $gf-color-primary;
  border: 4rpx solid $gf-color-primary-weak;
  border-radius: 50%;
  box-sizing: content-box;
}

.timeline-dot.updated {
  background-color: $gf-color-success;
  border-color: $gf-color-success-weak;
}

.timeline-dot.maintenance,
.timeline-dot.warranty {
  background-color: $gf-color-warning;
  border-color: $gf-color-warning-weak;
}

.timeline-dot.disposed {
  background-color: $gf-text-3;
  border-color: $gf-bg-page;
}

.timeline-line {
  width: 2rpx;
  flex: 1;
  margin: 4rpx 0;
  background-color: $gf-line;
}

.timeline-content {
  min-width: 0;
  flex: 1;
  padding: 0 0 $gf-space-md $gf-space-sm;
}

.timeline-head {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: $gf-space-sm;
}

.timeline-title {
  min-width: 0;
  flex: 1;
  font-size: $gf-font-md;
  font-weight: 600;
  color: $gf-text-1;
  word-break: break-all;
}

.timeline-date {
  flex-shrink: 0;
  padding-top: 2rpx;
  font-size: $gf-font-xs;
  line-height: 1.35;
  color: $gf-text-3;
}

.timeline-description,
.timeline-changes {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  line-height: 1.5;
  word-break: break-word;
}

.timeline-description {
  color: $gf-text-2;
}

.timeline-changes {
  color: $gf-text-3;
}
</style>
