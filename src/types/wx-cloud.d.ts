/**
 * wx.cloud 最小类型封装。
 *
 * 仅声明 Phase 1 用到的能力，签名与微信官方文档一致。
 * 通过 services/cloudbase.ts 内的模块级 `declare const wx` 局部遮蔽使用，
 * 避免与 @dcloudio/types 的全局声明冲突；禁止使用 any。
 */

export interface WxCloudInitOptions {
  env: string
  traceUser?: boolean
}

export interface WxCloudCallFunctionOptions {
  name: string
  data?: Record<string, unknown>
}

export interface WxCloudCallFunctionResult {
  result: unknown
}

/** 数据库文档最小结构 */
export interface WxCloudDocument {
  _id: string
  _openid?: string
  [key: string]: unknown
}

export interface WxCloudAddResult {
  _id: string
}

export interface WxCloudUpdateResult {
  stats: { updated: number }
}

export interface WxCloudRemoveResult {
  stats: { removed: number }
}

export interface WxCloudGetResult<TDoc> {
  data: TDoc[]
}

export interface WxCloudQueryChain {
  where(condition: Record<string, unknown>): WxCloudQueryChain
  orderBy(field: string, order: 'asc' | 'desc'): WxCloudQueryChain
  limit(count: number): WxCloudQueryChain
  get<TDoc = WxCloudDocument>(): Promise<WxCloudGetResult<TDoc>>
}

export interface WxCloudDocumentRef {
  update(options: { data: Record<string, unknown> }): Promise<WxCloudUpdateResult>
  remove(): Promise<WxCloudRemoveResult>
}

export interface WxCloudCollectionRef {
  add(options: { data: Record<string, unknown> }): Promise<WxCloudAddResult>
  doc(docId: string): WxCloudDocumentRef
  where(condition: Record<string, unknown>): WxCloudQueryChain
}

export interface WxCloudDatabaseApi {
  collection(name: string): WxCloudCollectionRef
}

export interface WxCloudApi {
  init(options: WxCloudInitOptions): void
  callFunction(options: WxCloudCallFunctionOptions): Promise<WxCloudCallFunctionResult>
  database(): WxCloudDatabaseApi
}
