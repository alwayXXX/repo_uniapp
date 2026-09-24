import type { PageParams, PageResult } from './common'
import type { MaintenanceDoc } from '@/types/maintenance'

export interface ListMaintenanceParams extends PageParams {
  deviceId: string
}

export type ListMaintenanceResult = PageResult<MaintenanceDoc>
