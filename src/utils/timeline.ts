import { TIMELINE_FIELD_LABELS } from '@/constants/timeline'
import type { DeviceTimelineEvent, TimelineEventType, TimelinePayload } from '@/types/timeline'

const EVENT_TYPES: readonly TimelineEventType[] = [
  'CREATED',
  'UPDATED',
  'MAINTENANCE',
  'WARRANTY',
  'DISPOSED',
]

export function isTimelineEventType(value: unknown): value is TimelineEventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)
}

/** 只提取白名单内的字段名，永不透传 payload 中的原始值。 */
export function parseTimelinePayload(value: unknown): TimelinePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { changedFields: [] }
  }
  const changedFields = (value as { changedFields?: unknown }).changedFields
  if (!Array.isArray(changedFields)) {
    return { changedFields: [] }
  }
  const allowed = changedFields.filter(
    (field): field is string =>
      typeof field === 'string' && Object.hasOwn(TIMELINE_FIELD_LABELS, field),
  )
  return { changedFields: [...new Set(allowed)] }
}

export function summarizeChangedFields(fields: readonly string[]): string {
  const labels = fields
    .map((field) => TIMELINE_FIELD_LABELS[field])
    .filter((label): label is string => typeof label === 'string')
  if (labels.length === 0) return ''
  const visible = labels.slice(0, 4)
  const suffix = labels.length > visible.length ? `等 ${labels.length} 项` : ''
  return `变更：${visible.join('、')}${suffix}`
}

/** API 契约顺序：事件日期倒序，同日按创建时间倒序。 */
export function compareTimelineEvents(
  left: DeviceTimelineEvent,
  right: DeviceTimelineEvent,
): number {
  const byEventDate = right.eventDate.localeCompare(left.eventDate)
  if (byEventDate !== 0) return byEventDate
  const byCreatedAt = right.createdAt.localeCompare(left.createdAt)
  if (byCreatedAt !== 0) return byCreatedAt
  return right.id.localeCompare(left.id)
}

export function sortTimelineEvents(items: readonly DeviceTimelineEvent[]): DeviceTimelineEvent[] {
  return [...items].sort(compareTimelineEvents)
}
