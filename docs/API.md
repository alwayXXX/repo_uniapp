# GearFlow 业务操作契约

## 1. 通用约定

### 实现方式

本文件保留原有业务能力定义，但不再假设所有操作都通过 NestJS REST API 实现。

| 类型         | 调用方式                          | 适用场景                                   |
| ------------ | --------------------------------- | ------------------------------------------ |
| 直接数据读取 | CloudBase SDK + 数据库安全规则    | 系统分类、用户自己的简单列表和详情         |
| 业务操作     | CloudBase 云函数 / PostgreSQL RPC | 跨集合写入、复杂校验、统计、注销和敏感操作 |
| 文件操作     | CloudBase 云存储 + 云函数         | P1 设备照片、发票和维修凭证                |

下文的 `device.create`、`statistics.overview` 等名称是稳定的业务操作标识，不是 HTTP 路径。未来如果引入 CloudBase 云托管 + NestJS，可以在不改变前端业务类型的前提下映射为 REST API。

### 身份

- 小程序调用 CloudBase 时使用平台提供的微信用户身份上下文。
- 云函数从可信上下文获取当前用户标识，并映射为 GearFlow `userId`。
- 客户端不得传入或覆盖 `userId`。
- 当前阶段不自行签发 accessToken / refreshToken，也不要求 Bearer JWT。

### 响应格式

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_NOT_FOUND",
    "message": "设备不存在",
    "requestId": "01J..."
  }
}
```

### 分页

```text
page: number，从 1 开始
pageSize: number，默认 20，最大 50
```

返回：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "hasMore": false
}
```

## 2. 错误码

| 错误码                    | 说明                                     |
| ------------------------- | ---------------------------------------- |
| UNAUTHORIZED              | CloudBase 身份无效或未建立 GearFlow 用户 |
| VALIDATION_ERROR          | 参数错误                                 |
| FORBIDDEN                 | 无权限访问资源                           |
| RESOURCE_NOT_FOUND        | 资源不存在                               |
| DEVICE_NOT_FOUND          | 设备不存在                               |
| CATEGORY_NOT_FOUND        | 分类不存在                               |
| DATE_RANGE_INVALID        | 日期范围错误                             |
| RATE_LIMITED              | 请求过于频繁或超过平台资源限制           |
| INTERNAL_ERROR            | 云函数或数据操作错误                     |
| IDENTITY_BOOTSTRAP_FAILED | CloudBase 身份初始化失败                 |

## 3. 认证接口

### 3.1 身份初始化

```text
auth.bootstrap
```

请求：

```json
{
  "privacyVersion": "1.0.0",
  "termsVersion": "1.0.0"
}
```

响应：

```json
{
  "user": {
    "id": "...",
    "nickname": null,
    "avatarUrl": null,
    "isNewUser": true
  }
}
```

规则：

- 云函数从 CloudBase 可信身份上下文读取用户标识
- 创建或查询 GearFlow User 文档
- 不返回 OpenID 或 CloudBase 管理凭据
- 未同意当前协议版本不能进入需要保存个人数据的功能

### 3.2 退出当前应用状态

```text
auth.logout
```

清理 GearFlow 客户端状态；CloudBase / 微信平台身份生命周期按官方能力处理。

## 4. 用户接口

### 4.1 获取当前用户

```text
user.getCurrent
```

### 4.2 更新用户资料

```text
user.updateProfile
```

请求：

```json
{
  "nickname": "Gear",
  "avatarUrl": "https://..."
}
```

资料均为可选，最小化收集。

### 4.3 申请注销

```text
user.deleteAccount
```

请求：

```json
{
  "confirmationText": "注销我的账号"
}
```

响应：

```json
{
  "status": "DELETED",
  "deletedAt": "2026-01-01T00:00:00.000Z"
}
```

## 5. 协议接口

### 5.1 获取协议

```text
policy.get
```

`type` 可选：

- `privacy`
- `terms`

响应：

```json
{
  "type": "privacy",
  "version": "1.0.0",
  "content": "...",
  "publishedAt": "2026-01-01"
}
```

### 5.2 记录同意

```text
policy.recordConsent
```

请求：

```json
{
  "version": "1.0.0"
}
```

## 6. 分类接口

### 6.1 获取分类

```text
category.list
```

响应：

```json
{
  "items": [
    {
      "id": "...",
      "code": "computer",
      "name": "电脑",
      "sortOrder": 1
    }
  ]
}
```

MVP 只提供系统分类，不提供自定义分类。该只读数据可由 CloudBase SDK 直接查询，并通过安全规则禁止客户端写入。

## 7. 设备接口

### 7.1 设备列表

```text
device.list
```

查询参数：

| 参数           | 类型       | 说明                                       |
| -------------- | ---------- | ------------------------------------------ |
| keyword        | string     | 搜索名称、品牌、型号                       |
| categoryId     | string     | 分类筛选                                   |
| status         | string     | 设备状态                                   |
| warrantyStatus | string     | in_warranty / expiring / expired / unknown |
| sortBy         | string     | createdAt / purchaseDate / name / price    |
| sortOrder      | asc / desc | 排序方向                                   |
| page           | number     | 页码                                       |
| pageSize       | number     | 每页数量                                   |

响应摘要：

```json
{
  "items": [
    {
      "id": "...",
      "name": "MacBook Pro",
      "brand": "Apple",
      "model": "M3 Pro",
      "category": {
        "id": "...",
        "name": "电脑"
      },
      "status": "IN_USE",
      "purchaseDate": "2026-01-01",
      "purchasePriceCents": 2000000,
      "warranty": {
        "endDate": "2027-01-01",
        "remainingDays": 120,
        "status": "IN_WARRANTY"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "hasMore": false
}
```

实现说明：简单筛选可由 CloudBase SDK 在 `userId` 权限范围内读取；搜索组合或查询规则复杂时通过云函数实现。

### 7.2 设备详情

```text
device.get
```

返回设备、保修摘要、维护记录摘要、时间线和成本摘要。

### 7.3 创建设备

```text
device.create
```

请求：

```json
{
  "categoryId": "...",
  "name": "MacBook Pro",
  "brand": "Apple",
  "model": "M3 Pro",
  "serialNumber": "optional",
  "status": "IN_USE",
  "purchaseDate": "2026-01-01",
  "purchaseChannel": "Apple Store",
  "purchasePriceCents": 2000000,
  "warranty": {
    "startDate": "2026-01-01",
    "endDate": "2027-01-01",
    "provider": "Apple",
    "scope": "官方保修",
    "notes": null
  }
}
```

校验：

- `name` 必填
- `categoryId` 必须有效
- `warranty.endDate >= warranty.startDate`
- `purchaseDate` 不能晚于今天
- 价格不能为负

实现说明：Phase 6 通过 `app.rdb()` 创建 Device，`userId` 由 `DEFAULT auth.uid()` 与 RLS 双重约束；PG 触发器同步追加 `CREATED` 时间线事件。Warranty 与 DeviceCost 不在本阶段写入，留给 Phase 7。

### 7.4 更新设备

```text
device.update
```

支持部分更新。业务字段确实变化时，PG 触发器追加 `UPDATED` 事件；状态转为 `SOLD / DISCARDED` 时改为追加 `DISPOSED`。仅 `updatedAt` 变化不生成事件。事件摘要只包含变更字段名，不包含变更前后原值。

### 7.5 删除设备

```text
device.delete
```

响应：

```json
{
  "deletedAt": "2026-01-01T00:00:00.000Z"
}
```

MVP 为软删除，默认列表和统计不再显示。PG 触发器在软删除时追加 `DISPOSED` 审计事件；时间线 RLS 随后因设备已删除而不再向客户端返回任何历史行。

## 8. 维护记录接口

### 8.1 维护记录列表

```text
maintenance.list
```

### 8.2 创建维护记录

```text
maintenance.create
```

请求：

```json
{
  "title": "更换电池",
  "type": "REPLACE",
  "occurredAt": "2026-02-01",
  "costCents": 80000,
  "vendor": "官方售后",
  "notes": "电池健康度下降到 79%"
}
```

### 8.3 更新维护记录

```text
maintenance.update
```

### 8.4 删除维护记录

```text
maintenance.delete
```

维护记录写操作通过云函数执行，并同步：

- 时间线
- 统计成本表

## 9. 时间线接口

```text
timeline.list
```

查询参数：

| 参数      | 类型   | 说明                                                        |
| --------- | ------ | ----------------------------------------------------------- |
| deviceId  | string | 设备 ID，必填；RLS 仍强制校验归属                           |
| page      | number | 页码，从 1 开始                                             |
| pageSize  | number | 每页数量，默认 20、最大 50                                  |
| eventType | string | 可选；CREATED / UPDATED / MAINTENANCE / WARRANTY / DISPOSED |

响应：

```json
{
  "items": [
    {
      "id": "...",
      "deviceId": "...",
      "eventType": "UPDATED",
      "eventDate": "2026-08-31",
      "title": "更新设备",
      "description": "设备档案已更新",
      "payload": {
        "changedFields": ["name", "status"]
      },
      "createdAt": "2026-08-31T08:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "hasMore": false
}
```

约束：

- 固定按 `eventDate DESC, createdAt DESC` 返回。
- 设备不存在、属于他人或已软删除时，返回空集合，不泄露资源是否存在。
- `payload` 不得包含序列号、价格、备注、照片地址或任何字段原值。
- 客户端无时间线写权限，不提供 create / update / delete 接口。

## 10. 统计接口

```text
statistics.overview
```

实现约束：统计通过 CloudBase PostgreSQL `SECURITY DEFINER` RPC 执行，服务端从 `auth.uid()` 绑定用户，不接受客户端传入的 `userId`。所有统计过滤 `devices.deleted_at IS NULL`。

查询参数：

| 参数       | 类型   | 说明     |
| ---------- | ------ | -------- |
| startDate  | date   | 开始日期 |
| endDate    | date   | 结束日期 |
| categoryId | string | 可选分类 |

响应：

```json
{
  "deviceCount": 12,
  "activeDeviceCount": 10,
  "totalAssetCents": 12345678,
  "purchaseSpendCents": 987654,
  "maintenanceSpendCents": 12345,
  "currency": "CNY",
  "warrantySummary": {
    "inWarranty": 6,
    "expiringIn30Days": 2,
    "expired": 3,
    "unknown": 1
  },
  "categoryDistribution": [
    {
      "categoryId": "...",
      "categoryName": "电脑",
      "deviceCount": 3,
      "assetCents": 600000
    }
  ],
  "lifecycleDistribution": [
    {
      "status": "IN_USE",
      "label": "使用中",
      "deviceCount": 8,
      "assetCents": 9000000
    }
  ]
}
```

统计口径：

- `deviceCount` / `activeDeviceCount` / 保修状态 / 分类分布 / 生命周期分布：当前未软删除设备；`activeDeviceCount` 为 `IN_USE` 与 `IDLE` 状态之和。
- `totalAssetCents`：直读当前未软删除设备的 `devices.purchase_price_cents`，不受日期范围限制；空价格不计入。
- `purchaseSpendCents`：按 `devices.purchase_date` 落在 `[startDate, endDate]` 的购买价格聚合；空购买日期不计入。
- `maintenanceSpendCents`：只聚合 `device_costs.cost_type = 'MAINTENANCE'` 且 `occurred_at` 落在日期范围内的成本行，并关联当前未软删除设备。
- `currency`：当前 MVP 默认 `CNY`；金额均以整数分返回，前端负责千分位与符号展示。
- 日期范围无效时，前端回退为当年 1 月 1 日至 12 月 31 日；服务端仍会拒绝无法解析的日期参数。

## 11. P1 / P2 预留接口

### 附件

```text
attachment.prepareUpload
attachment.getMetadata
attachment.delete
```

### 提醒

```text
reminder.list
reminder.subscribe
```

### 导出

```text
export.create
export.get
```

这些接口不在 MVP P0 实现。

## 12. 未来 REST 映射

如果未来采用 CloudBase 云托管 + NestJS，本文件中的业务操作可映射为 `/api/v1` REST 路径。届时再定义 HTTP 状态码、JWT 或服务间认证、限流和版本治理；当前阶段不实现也不安装相关依赖。
