import { AppError } from '@/utils/error'

let revision = 0

export function clientRevision(): number {
  return revision
}

export function invalidateClientRequests(): void {
  revision += 1
}

export function assertClientRevision(expected: number): void {
  if (expected !== revision) {
    throw new AppError('UNAUTHORIZED', '登录状态已改变，请重新操作')
  }
}
