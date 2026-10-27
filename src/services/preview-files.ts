import { AppError } from '@/utils/error'

const pending = new Set<string>()
let sequence = 0
interface PreviewFs {
  mkdirSync(path: string, recursive: boolean): void
  writeFileSync(path: string, content: string, encoding: string): void
  readdirSync(path: string): string[]
  unlinkSync(path: string): void
}
interface PreviewApi {
  env?: { USER_DATA_PATH: string }
  getFileSystemManager?(): PreviewFs
}
function previewApi(): PreviewApi | undefined {
  return (globalThis as unknown as { wx?: PreviewApi }).wx
}
function fsMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String((error as { errMsg?: string })?.errMsg || '')
}
export function trackPreviewFile(path: string): void {
  pending.add(path)
}

export function writePreviewFile(content: string, mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }
  const extension = extensions[mimeType]
  const api = previewApi()
  const fs = api?.getFileSystemManager?.()
  if (
    !extension ||
    typeof content !== 'string' ||
    !content ||
    content.length > Math.ceil((2 * 1024 * 1024) / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content)
  )
    throw new AppError('INTERNAL_ERROR', '附件内容无效')
  if (!api?.env || !fs) throw new AppError('INTERNAL_ERROR', '本机文件系统不可用')
  const directory = `${api.env.USER_DATA_PATH}/gearflow-previews`
  try {
    fs.mkdirSync(directory, true)
  } catch (error) {
    if (!/already exists|EEXIST/i.test(fsMessage(error)))
      throw new AppError('INTERNAL_ERROR', '无法创建预览目录')
  }
  const path = `${directory}/gearflow_preview_${Date.now()}_${++sequence}.${extension}`
  trackPreviewFile(path)
  try {
    fs.writeFileSync(path, content, 'base64')
  } catch {
    clearPreviewFiles()
    throw new AppError('INTERNAL_ERROR', '附件预览文件生成失败')
  }
  return path
}

/** Remove only GearFlow preview files, including leftovers from a previous process. */
export function clearPreviewFiles(): void {
  const api = previewApi()
  const fs = api?.getFileSystemManager?.()
  if (!fs) return
  let failed = false
  if (api?.env) {
    const directory = `${api.env.USER_DATA_PATH}/gearflow-previews`
    try {
      for (const name of fs.readdirSync(directory))
        if (/^gearflow_preview_\d+_\d+\.(png|jpg|webp|pdf)$/.test(name))
          pending.add(`${directory}/${name}`)
    } catch (error) {
      if (!/no such file|not exist|ENOENT/i.test(fsMessage(error))) failed = true
    }
  }
  for (const path of pending) {
    try {
      fs.unlinkSync(path)
      pending.delete(path)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String((error as { errMsg?: string })?.errMsg || '')
      if (/no such file|not exist|ENOENT/i.test(message)) pending.delete(path)
      else failed = true
    }
  }
  if (failed) throw new AppError('INTERNAL_ERROR', '附件预览文件清理失败，请重试')
}
