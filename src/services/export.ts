/**
 * 数据导出（Phase 11）：把设备台账与维护记录导出为 CSV 并分享。
 * 数据经客户端 RLS 查询获取，CSV 在本机生成后通过微信分享给用户，
 * 不经过任何第三方服务器。
 */
import { buildCsvWithBom, type CsvColumn } from '@/utils/csv'
import { centsToYuan } from '@/utils/money'
import { DEVICE_STATUS_LABELS } from '@/constants/device'
import { MAINTENANCE_TYPE_LABELS } from '@/constants/maintenance'
import type { DeviceDoc } from '@/types/device'
import type { MaintenanceDoc } from '@/types/maintenance'

export interface ExportFileResult {
  filePath: string
  fileName: string
}

function timestampSuffix(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

function deviceColumns(categoryNameOf: (id: string | null) => string): Array<CsvColumn<DeviceDoc>> {
  return [
    { header: '名称', value: (d) => d.name },
    { header: '分类', value: (d) => categoryNameOf(d.categoryId) },
    {
      header: '状态',
      value: (d) => DEVICE_STATUS_LABELS[d.status] ?? d.status,
    },
    { header: '品牌', value: (d) => d.brand },
    { header: '型号', value: (d) => d.model },
    { header: '序列号', value: (d) => d.serialNumber },
    { header: '购买日期', value: (d) => d.purchaseDate },
    { header: '购买渠道', value: (d) => d.purchaseChannel },
    { header: '购买价格(元)', value: (d) => centsToYuan(d.purchasePriceCents) },
    { header: '币种', value: (d) => d.currency },
    { header: '备注', value: (d) => d.notes },
    { header: '录入时间', value: (d) => d.createdAt },
  ]
}

export function buildDevicesCsv(
  devices: DeviceDoc[],
  categoryNameOf: (id: string | null) => string,
): string {
  return buildCsvWithBom(deviceColumns(categoryNameOf), devices)
}

export function buildMaintenanceCsv(
  device: DeviceDoc,
  records: MaintenanceDoc[],
  categoryNameOf: (id: string | null) => string,
): string {
  const columns: Array<CsvColumn<MaintenanceDoc>> = [
    { header: '设备名称', value: () => device.name },
    { header: '设备分类', value: () => categoryNameOf(device.categoryId) },
    { header: '标题', value: (m) => m.title },
    { header: '类型', value: (m) => MAINTENANCE_TYPE_LABELS[m.type] ?? m.type },
    { header: '发生日期', value: (m) => m.occurredAt },
    { header: '费用(元)', value: (m) => centsToYuan(m.costCents) },
    { header: '服务商', value: (m) => m.vendor },
    { header: '备注', value: (m) => m.notes },
    { header: '录入时间', value: (m) => m.createdAt },
  ]
  return buildCsvWithBom(columns, records)
}

/** 微信文件系统/分享的窄接口（第三方类型边界收敛） */
interface WxFileSystemManager {
  writeFileSync(filePath: string, data: string, encoding: string): void
}
interface WxShareApi {
  env: { USER_DATA_PATH: string }
  shareFileMessage(options: {
    filePath: string
    success: () => void
    fail: (err: { errMsg?: string }) => void
  }): void
}

function getWxShareApi(): WxShareApi {
  const api = (globalThis as unknown as { wx?: WxShareApi }).wx
  if (!api || typeof api.shareFileMessage !== 'function') {
    throw new Error('当前微信版本过低，不支持文件分享，请升级微信')
  }
  return api
}

/**
 * 保存 CSV 到本机并唤起微信分享（发送给朋友 / 文件传输助手）。
 * 仅微信小程序端可用。
 */
export async function saveAndShareCsv(
  fileName: string,
  content: string,
): Promise<ExportFileResult> {
  // #ifdef MP-WEIXIN
  const wxApi = getWxShareApi()
  const fs = (
    uni as unknown as { getFileSystemManager(): WxFileSystemManager }
  ).getFileSystemManager()
  const filePath = `${wxApi.env.USER_DATA_PATH}/${fileName}`
  fs.writeFileSync(filePath, content, 'utf8')
  await new Promise<void>((resolve, reject) => {
    wxApi.shareFileMessage({
      filePath,
      success: () => resolve(),
      fail: (err) => {
        // 用户取消分享不算失败：文件已生成
        if (err.errMsg && err.errMsg.includes('cancel')) {
          resolve()
          return
        }
        reject(new Error(err.errMsg || '分享失败'))
      },
    })
  })
  return { filePath, fileName }
  // #endif

  // #ifndef MP-WEIXIN
  throw new Error('当前平台暂不支持文件导出，请在微信小程序内使用')
  // #endif
}

/** 组装导出文件名：前缀_时间戳.csv */
export function csvFileName(prefix: string): string {
  return `${prefix}_${timestampSuffix()}.csv`
}
