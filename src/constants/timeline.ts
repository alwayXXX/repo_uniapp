/** 时间线 payload 允许展示的字段名白名单；不包含任何字段值。 */
export const TIMELINE_FIELD_LABELS: Readonly<Record<string, string>> = {
  categoryId: '分类',
  name: '名称',
  status: '状态',
  brand: '品牌',
  model: '型号',
  serialNumber: '序列号',
  purchaseDate: '购买日期',
  purchaseChannel: '购买渠道',
  purchasePriceCents: '购买价格',
  currency: '币种',
  disposalDate: '处置日期',
  disposalPriceCents: '处置金额',
  notes: '备注',
  deletedAt: '删除状态',
}
