import { describe, expect, it } from 'vitest'
import {
  isTimelineEventType,
  parseTimelinePayload,
  sortTimelineEvents,
  summarizeChangedFields,
} from './timeline'
import type { DeviceTimelineEvent } from '@/types/timeline'

function event(id: string, eventDate: string, createdAt: string): DeviceTimelineEvent {
  return {
    id,
    deviceId: 'device-1',
    eventType: 'UPDATED',
    eventDate,
    title: '更新设备',
    description: null,
    payload: { changedFields: [] },
    createdAt,
  }
}

describe('parseTimelinePayload', () => {
  it('只保留去重后的允许字段名', () => {
    expect(
      parseTimelinePayload({
        changedFields: ['name', 'status', 'name', 'unknown'],
        serialNumber: 'sensitive-value',
      }),
    ).toEqual({ changedFields: ['name', 'status'] })
  })

  it('拒绝非数组或带原始值的 payload', () => {
    expect(parseTimelinePayload({ changedFields: { name: '新名称' } })).toEqual({
      changedFields: [],
    })
    expect(parseTimelinePayload('序列号原文')).toEqual({ changedFields: [] })
  })
})

describe('summarizeChangedFields', () => {
  it('只显示字段名且限制长度', () => {
    expect(summarizeChangedFields(['name', 'status'])).toBe('变更：名称、状态')
    expect(summarizeChangedFields(['name', 'status', 'brand', 'model', 'purchaseDate'])).toBe(
      '变更：名称、状态、品牌、型号等 5 项',
    )
  })
})

describe('timeline ordering', () => {
  it('按事件日期和创建时间倒序', () => {
    const items = [
      event('a', '2026-08-30', '2026-08-30T10:00:00.000Z'),
      event('b', '2026-08-31', '2026-08-31T09:00:00.000Z'),
      event('c', '2026-08-31', '2026-08-31T11:00:00.000Z'),
    ]
    expect(sortTimelineEvents(items).map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('isTimelineEventType', () => {
  it('只接受契约事件类型', () => {
    expect(isTimelineEventType('CREATED')).toBe(true)
    expect(isTimelineEventType('RAW_SERIAL_NUMBER')).toBe(false)
  })
})
