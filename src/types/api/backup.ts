/** Data owned by the current user, without OpenID or cloud file locations. */
export type BackupRecord = Record<string, unknown>

export interface BackupAttachment extends BackupRecord {
  id: string
  deviceId: string
  name: string
  mimeType: string
  size: number
  createdAt: string
}

export interface BackupSnapshot {
  devices: BackupRecord[]
  warranties: BackupRecord[]
  maintenances: BackupRecord[]
  timelines: BackupRecord[]
  categories: BackupRecord[]
  attachments: BackupAttachment[]
}

export interface BackupFileContent {
  id: string
  content: string
}

export interface BackupBundle {
  format: 'gearflow-backup'
  version: 2
  createdAt: string
  snapshot: BackupSnapshot
  files: BackupFileContent[]
  checksum: string
}

export type RestorePreviewState = 'skip' | 'create' | 'resume' | 'conflict'

export interface RestorePreviewItem {
  id: string
  state: RestorePreviewState
}

export interface RestoreSummary {
  devices: number
  skipped: number
  conflicts: number
  records: number
}
