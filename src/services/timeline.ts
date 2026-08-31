import { asSdkResult, getRdb, throwIfError } from './cloudbase'
import { AppError, isRecord } from '@/utils/error'
import { isTimelineEventType, parseTimelinePayload, sortTimelineEvents } from '@/utils/timeline'
import type { ListTimelineParams, ListTimelineResult } from '@/types/api/timeline'
import type { DeviceTimelineEvent } from '@/types/timeline'

const DEVICE_TIMELINES = 'device_timelines'
const MAX_PAGE_SIZE = 50

interface TimelineRow {
  id: string
  device_id: string
  event_type: string
  event_date: string
  title: string
  description: string | null
  payload: unknown
  created_at: string
}

function parseRows(raw: unknown): TimelineRow[] {
  if (!Array.isArray(raw)) {
    throw new AppError('INTERNAL_ERROR', '时间线数据格式错误')
  }
  return raw.filter(
    (row): row is TimelineRow =>
      isRecord(row) &&
      typeof row.id === 'string' &&
      typeof row.device_id === 'string' &&
      typeof row.event_type === 'string' &&
      typeof row.event_date === 'string' &&
      typeof row.title === 'string' &&
      typeof row.created_at === 'string',
  )
}

function toTimelineEvent(row: TimelineRow): DeviceTimelineEvent | null {
  if (!isTimelineEventType(row.event_type)) return null
  return {
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    eventDate: row.event_date,
    title: row.title,
    description: typeof row.description === 'string' ? row.description : null,
    payload: parseTimelinePayload(row.payload),
    createdAt: row.created_at,
  }
}

/** timeline.list：RLS 限定本人且关联设备未软删除。 */
export async function listDeviceTimeline(params: ListTimelineParams): Promise<ListTimelineResult> {
  const page = Math.max(1, Math.trunc(params.page))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(params.pageSize)))
  const from = (page - 1) * pageSize

  let query = getRdb()
    .from(DEVICE_TIMELINES)
    .select('*', { count: 'exact' })
    .eq('device_id', params.deviceId)

  if (params.eventType) {
    query = query.eq('event_type', params.eventType)
  }

  const result = asSdkResult<unknown>(
    await query
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1),
  )
  throwIfError(result.error, '读取时间线失败')

  const items = sortTimelineEvents(
    parseRows(result.data)
      .map(toTimelineEvent)
      .filter((item): item is DeviceTimelineEvent => item !== null),
  )
  const total = typeof result.count === 'number' ? result.count : from + items.length

  return {
    items,
    page,
    pageSize,
    total,
    hasMore: from + items.length < total,
  }
}
