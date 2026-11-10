import { phase11Request } from './phase11'
import { AppError, isRecord } from '@/utils/error'
import type {
  AdvisorFacts,
  AdvisorResult,
  AnnualFacts,
  AnnualResult,
  ImageResult,
} from '@/types/api/ai'

function list(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 5 ||
    value.some((item) => typeof item !== 'string' || item.length > 500)
  )
    throw new AppError('INTERNAL_ERROR', 'AI 返回格式异常，请稍后重试')
  return value as string[]
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > maximum)
    throw new AppError('INTERNAL_ERROR', 'AI 返回格式异常，请稍后重试')
  return value
}

async function request(kind: string, data: object): Promise<Record<string, unknown>> {
  const result = await phase11Request<unknown>('ai.request', { kind, data, confirmed: true })
  if (!isRecord(result) || Array.isArray(result))
    throw new AppError('INTERNAL_ERROR', 'AI 返回格式异常，请稍后重试')
  return result
}

export async function requestAdvisor(data: AdvisorFacts): Promise<AdvisorResult> {
  const value = await request('advisor', data)
  return { suggestions: list(value.suggestions), missing: list(value.missing) }
}

export async function requestAnnual(data: AnnualFacts): Promise<AnnualResult> {
  const value = await request('annual', data)
  return { observations: list(value.observations), suggestions: list(value.suggestions) }
}

export async function requestImage(data: {
  mimeType: string
  content: string
}): Promise<ImageResult> {
  const value = await request('image', data)
  return {
    category: optionalText(value.category, 32),
    brand: optionalText(value.brand, 64),
    model: optionalText(value.model, 128),
  }
}

interface ImageFiles {
  chooseMedia(options: {
    count: number
    mediaType: string[]
    sourceType: string[]
    success: (value: { tempFiles: Array<{ tempFilePath: string; size: number }> }) => void
    fail: (error: { errMsg?: string }) => void
  }): void
  getFileSystemManager(): { readFileSync(path: string, encoding: 'base64'): string }
}

function imageFiles(): ImageFiles {
  const api = (globalThis as unknown as { wx?: ImageFiles }).wx
  if (!api) throw new AppError('INTERNAL_ERROR', '请在微信小程序内使用')
  return api
}

export async function chooseAiImage(): Promise<{ path: string; size: number } | null> {
  const selected = await new Promise<{ path: string; size: number } | null>((resolve, reject) => {
    imageFiles().chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: ({ tempFiles }) => {
        const file = tempFiles[0]
        resolve(file ? { path: file.tempFilePath, size: file.size } : null)
      },
      fail: (error) =>
        error.errMsg?.includes('cancel')
          ? resolve(null)
          : reject(new AppError('INTERNAL_ERROR', '图片选择失败')),
    })
  })
  if (
    selected &&
    (!Number.isSafeInteger(selected.size) || selected.size <= 0 || selected.size > 1024 * 1024)
  )
    throw new AppError('VALIDATION_ERROR', '请选择不超过 1 MiB 的 JPEG 或 PNG 图片')
  return selected
}

export function readAiImage(path: string): { mimeType: string; content: string } {
  const content = imageFiles().getFileSystemManager().readFileSync(path, 'base64')
  const mimeType = content.startsWith('/9j/')
    ? 'image/jpeg'
    : content.startsWith('iVBORw0KGgo')
      ? 'image/png'
      : ''
  if (!mimeType || content.length > Math.ceil((1024 * 1024) / 3) * 4)
    throw new AppError('VALIDATION_ERROR', '请选择不超过 1 MiB 的 JPEG 或 PNG 图片')
  return { mimeType, content }
}
