/** 设备生命周期事件类型（docs/DATABASE.md 4.7）。 */
export type TimelineEventType = 'CREATED' | 'UPDATED' | 'MAINTENANCE' | 'WARRANTY' | 'DISPOSED'

/** 时间线只允许保存非敏感字段名摘要。 */
export interface TimelinePayload {
  changedFields: string[]
}

/** device_timelines 表业务模型（snake_case 由服务层映射）。 */
export interface DeviceTimelineEvent {
  id: string
  deviceId: string
  eventType: TimelineEventType
  /** YYYY-MM-DD */
  eventDate: string
  title: string
  description: string | null
  payload: TimelinePayload
  createdAt: string
}
