import { callGearFlowApi } from './cloudbase'
import { isRecord } from '@/utils/error'
import { isTimelineEventType, parseTimelinePayload, sortTimelineEvents } from '@/utils/timeline'
import type { ListTimelineParams, ListTimelineResult } from '@/types/api/timeline'
import type { DeviceTimelineEvent } from '@/types/timeline'
import { ensureSession } from './auth'

const MAX_PAGE_SIZE = 50

function toTimelineEvent(value: unknown): DeviceTimelineEvent | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.deviceId !== 'string' ||
    !isTimelineEventType(value.eventType) ||
    typeof value.eventDate !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return null
  }
  return {
    id: value.id,
    deviceId: value.deviceId,
    eventType: value.eventType,
    eventDate: value.eventDate,
    title: value.title,
    description: typeof value.description === 'string' ? value.description : null,
    payload: parseTimelinePayload(value.payload),
    createdAt: value.createdAt,
  }
}

/** timeline.list：云函数按 OPENID 限定本人设备时间线。 */
export async function listDeviceTimeline(params: ListTimelineParams): Promise<ListTimelineResult> {
  await ensureSession()
  const page = Math.max(1, Math.trunc(params.page))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(params.pageSize)))
  const data = await callGearFlowApi<{
    items: unknown[]
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }>('timeline.list', {
    deviceId: params.deviceId,
    eventType: params.eventType ?? null,
    page,
    pageSize,
  })

  const items = sortTimelineEvents(
    data.items.map(toTimelineEvent).filter((item): item is DeviceTimelineEvent => item !== null),
  )

  return {
    items,
    page: Number(data.page) || page,
    pageSize: Number(data.pageSize) || pageSize,
    total: Number(data.total) || items.length,
    hasMore: data.hasMore === true,
  }
}
