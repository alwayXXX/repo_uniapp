import type { PageParams, PageResult } from './common'
import type { DeviceTimelineEvent, TimelineEventType } from '@/types/timeline'

/** timeline.list 查询参数（docs/API.md 第 9 节）。 */
export interface ListTimelineParams extends PageParams {
  deviceId: string
  eventType?: TimelineEventType
}

export type ListTimelineResult = PageResult<DeviceTimelineEvent>
