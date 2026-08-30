import { getDatabase } from './cloudbase'
import { toAppError } from '@/utils/error'
import type { DeviceDoc, DeviceStatus } from '@/types/device'

const DEVICES = 'devices'

/**
 * Phase 1 数据库验证用的最小设备操作（docs/API.md device.list / device.create）。
 *
 * 用户隔离模型（Phase 1）：
 * - 客户端写入由系统自动打上 `_openid`，禁止手动设置；
 * - 集合安全规则 `doc._openid == auth.openid` 保证只能读写自己的文档；
 * - 查询显式携带 `where({ _openid: '{openid}' })`，`{openid}` 由云端替换为调用者身份；
 * - `userId` 由云函数从可信身份上下文写入（Phase 4 设备云函数），客户端永远只写 null。
 */

export interface CreateDeviceInput {
  name: string
  status?: DeviceStatus
}

export async function createDevice(input: CreateDeviceInput): Promise<string> {
  try {
    const now = new Date().toISOString()
    const result = await getDatabase()
      .collection(DEVICES)
      .add({
        data: {
          name: input.name,
          status: input.status ?? 'IN_USE',
          userId: null,
          createdAt: now,
          updatedAt: now,
        },
      })
    return result._id
  } catch (err) {
    throw toAppError(err)
  }
}

export async function listDevices(limit = 20): Promise<DeviceDoc[]> {
  try {
    const result = await getDatabase()
      .collection(DEVICES)
      .where({ _openid: '{openid}' })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get<DeviceDoc>()
    // 网络数据不做完全信任，至少校验关键字段后再进入 UI
    return result.data.filter((doc) => typeof doc._id === 'string' && typeof doc.name === 'string')
  } catch (err) {
    throw toAppError(err)
  }
}

export async function renameDevice(deviceId: string, name: string): Promise<void> {
  try {
    await getDatabase()
      .collection(DEVICES)
      .doc(deviceId)
      .update({ data: { name, updatedAt: new Date().toISOString() } })
  } catch (err) {
    throw toAppError(err)
  }
}

export async function removeDevice(deviceId: string): Promise<void> {
  try {
    await getDatabase().collection(DEVICES).doc(deviceId).remove()
  } catch (err) {
    throw toAppError(err)
  }
}
