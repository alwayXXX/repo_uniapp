# GearFlow 业务操作契约

> **2026-11-10 Phase 12**：用户已授权自用备份与恢复及三项设备 AI 功能；备份已交付，AI 在本地开发中，接口、隐私同意和验收边界见 `docs/PHASE12.md`，不得将规划接口当作已部署能力。

AI 输入摘要（开发中）：`AdvisorFacts` 只含分类、品牌、型号、状态、购买日期、保修到期日、统计日期、维护次数与已记录费用汇总；`AnnualFacts` 只含既有年度报告的数值汇总和逐月统计。两者由客户端白名单组装并展示供本人逐次确认；序列号、备注、发票、身份和任意额外字段不得自动传给模型。跨环境身份校验、次数限制及接口已有本地实现，线上尚未验证，不得将类型或本地测试视为模型功能可用。

设备顾问服务端（开发中）再次校验白名单与日期、金额、维护次数，拒绝额外字段；发送明确限定的 JSON，要求模型仅返回 `suggestions` 与 `missing` 字符串数组。输入非法、模型结果无法解析或格式超限时失败，不自动修改数据；设备事实由本地记录展示，模型建议须标明需要核对。签名、防重放和限额已有本地实现，真实模型链路仍未接通。

设备顾问调用顺序：先对服务端规范化后的白名单 JSON 计算 SHA-256，再验证短时凭证绑定的可信身份、功能、摘要与时间；以原子操作消费对应凭证成功后才调用模型。任何验证或消费异常均直接失败；模型调用失败也不能再次使用同一凭证。业务函数等待 AI 环境响应最多 50 秒，超时不自动重试，客户端与函数的总超时仍为 60 秒。

各类 AI 请求使用递归按键名排序的规范 JSON 计算摘要，避免客户端和云函数因对象键顺序不同产生误判。只接受已验证的 JSON 值，摘要必须与本人确认的内容及凭证绑定。

AI 环境的事件函数（开发中）只接收原环境服务端签发的短时凭证及已确认数据，调用原环境的内部消费入口原子确认后执行模型；凭证和用户 OPENID 不返回客户端。服务端只返回经白名单解析的候选结果或固定错误码。入口、云端权限和实际跨环境调用必须在部署前后分别验证。

原环境规划增加 `ai.request({kind,data,confirmed:true})` 和内部 `ai.consume({kind,digest,token})`。前者使用微信可信身份，要求最新隐私记录及本次确认；后者不信任前端身份，只消费服务端签发的短时凭证，失败时不访问模型。账户注销先冻结账户和 AI 记录，再删除数据；失败保留 `DELETING` 状态并允许本人重试。以上为开发契约，在迁移、权限、兼容和真实测试完成前不得部署。

年度解读服务端（开发中）只接受年度与 12 个月的白名单统计，检查各月与年度总数、总支出及净支出的一致性，随后要求模型返回 `observations` 与 `suggestions` 数组。模型输出属于参考文字，页面中的数字继续取自原始年度报告；校验或模型失败不能覆盖原报告。

图片识别服务端（开发中）仅接受本人选择并确认的单张 JPEG 或 PNG，图像数据经校验后通过模型接口的 Base64 data URL 传递；不使用公开链接，应用代码不保存或记录图像内容。返回仅为分类、品牌和型号候选，无法确认的字段为空；用户必须在表单中核对并确认后才保存。传输大小、平台日志与服务方保存规则仍需在真实链路中验证。

`backup.snapshot`（已随备份版部署）按可信 OPENID 读取本人未删除设备、保修、维护、时间线、附件元数据和系统分类映射；不返回 OPENID、云路径或附件二进制，关联附件存在未完成操作时明确失败。客户端逐一使用既有 `attachment.open`，在前后两次快照一致时生成带 SHA-256 的版本化 JSON。备份文件未加密，主动分享与保存由用户决定；超过单文件上限、附件缺失或快照发生变化时不得报告备份成功。所有 `backup.*` 接口需要本人已确认隐私指引 1.2.0；既有 P11 接口兼容 1.1.0 或 1.2.0，避免新云函数部署后中断旧体验版。

`backup.restore.preview({ devices: [{ id, categoryCode }] })` 只读预检至多 1000 台设备，逐项返回 `skip`（原设备仍在）、`create`（可新增）、`resume`（已有此前恢复的副本）、`conflict`（分类不可用或此前副本已删除）。它不接收用户身份，也不写入任何资料。客户端必须先校验文件并向用户展示结果。

经用户确认后，`backup.restore.device({ device, categoryCode })` 新增或恢复进度，不更新现有设备；`backup.restore.warranty/maintenance/timeline({ sourceDeviceId, item })` 与 `backup.restore.attachment({ sourceDeviceId, item, content })` 分别补入关联记录或附件。服务端按当前 OPENID、备份中的原始标识和内容派生稳定的新标识，所有字段再次校验；原设备仍在时禁止补写，客户端也必须跳过该设备。重复请求只补缺失项目，不覆盖用户后来修改的数据；附件内容相同的超时重试使用同一存储路径，保留可重试元数据。恢复不是数据库事务，单项失败时中止并允许用户重新选择同一文件继续；绝不自动恢复微信订阅授权。上述备份恢复接口已随 1.2.2 部署并经本人验证设备及测试图片恢复。

> **2026-10-27 Phase 11**：用户已授权全清单。新增 `device.dispose`、`report.annual`、`export.json`、`attachment.list/upload/open/delete`、`reminder.config/list/create/cancel`；字段和范围以 `docs/PHASE11.md` 及 `src/types/api/phase11.ts` 为准。全部以可信 OPENID 鉴权，附件和消息必须用户主动触发；报表/导出无持久副作用。

`attachment.open({ id })` 经归属校验后返回 `{ content: string /* base64，原文件至多 2 MiB */, mimeType: string }`。不返回云路径或下载 URL，客户端写入专用预览临时目录并按生命周期清理。`reminder.config` 区分 `NO_TEMPLATE` 和 `PLATFORM_UNAVAILABLE`，仅携带固定原因/脱敏平台错误码，不因平台不可用而隐藏取消已有提醒的入口。

> **当前实现**：客户端调用 gearflow-api；云函数读取可信 OPENID 并访问 CloudBase MySQL。

## 1. 通用约定

### 实现方式

本文件保留原有业务能力定义，但不再假设所有操作都通过 NestJS REST API 实现。

| 类型         | 调用方式                  | 适用场景                                 |
| ------------ | ------------------------- | ---------------------------------------- |
| 直接数据读取 | 无；统一走 `gearflow-api` | 避免客户端持有数据库查询与归属规则       |
| 业务操作     | `gearflow-api` 云函数     | 跨表写入、复杂校验、统计、注销和敏感操作 |
| 文件操作     | CloudBase 云存储 + 云函数 | P1 设备照片、发票和维修凭证              |

下文的 `device.create`、`statistics.overview` 等名称是稳定的业务操作标识，不是 HTTP 路径。未来如果引入 CloudBase 云托管 + NestJS，可以在不改变前端业务类型的前提下映射为 REST API。

### 身份

- 微信小程序调用云函数时由运行环境自动注入 OPENID。
- `gearflow-api` 使用该 OPENID 作为唯一归属条件，不信任客户端指定的归属。
- 客户端不得传入或覆盖 `userId` / `openid`。
- 当前不再使用自定义登录票据、accessToken 或 refreshToken。

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
  "privacyVersion": "1.0.1",
  "termsVersion": "1.0.1"
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

- `gearflow-api` 从微信运行环境读取可信 OPENID
- 创建或查询 GearFlow `users` 行
- 不返回 OpenID 或 CloudBase 管理凭据
- 未同意当前协议版本不能进入需要保存个人数据的功能
- 只有用户主动点击“同意并开始使用”才调用带协议版本的 `auth.bootstrap`，成功后保存本机已确认版本；旧的 `gf_onboarded=1` 不能代表同意新版协议。
- 恢复登录使用 `auth.restore`：建立有效会话并读取当前用户，不新增协议同意记录。用户不存在时返回引导页，不能自动补造同意记录。

### 3.2 退出当前应用状态

```text
auth.logout
```

调用 CloudBase SDK `signOut()` 结束本机持久化会话，并清理用户及设备 Store、筛选缓存、本机协议版本和应用生成的 CSV 临时文件；不会删除云端业务数据。退出会使尚未完成的加载和导出失效，旧请求不能把数据写回客户端。

本机文件清理失败时不能静默忽略；再次登录前会重试清理，失败则不恢复用户数据。

CloudBase SDK 的退出与会话查询必须检查返回值的 `error`，不能仅凭 Promise 正常结束判断成功。退出后的新登录不得继续复用已经失效、尚未结束的用户初始化请求。

首次登录没有既有会话时，不预先调用旧令牌撤销；存在旧会话时须完成清理再交换新票据。协议确认与会话恢复仍使用同一可信微信登录通道。

文件系统同步异常需兼容 `Error.message` 与微信 `errMsg`：仅“文件或目录已不存在”视为已清理，权限、存储等其他错误仍须报告。一个文件清理失败不应阻止尝试清理其余应用导出文件。

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

资料均为可选，最小化收集。客户端只能通过服务端边界更新 `nickname` / `avatarUrl`，不能直接修改 `identityId` 或 `status`。

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

客户端在注销前先清理应用内导出临时文件；清理失败必须提示并允许重试，不假报注销完成。服务端删除成功后清除本机业务状态，即使 SDK 退出失败也不能保留设备缓存；此时明确提示云端注销已完成、本机清理待重试。用户已主动分享至聊天或其他应用的副本不在本应用可删除范围内。

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
  "version": "1.0.1",
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
  "version": "1.0.1"
}
```

协议版本变化时必须重新展示并由用户明确确认；正常启动、切换页面、恢复会话和继续使用均不能代替该动作。协议页在未登录状态下可访问，并提供微信原生意见反馈入口。

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

- `name` 必填且去空白后不超过 64 个字符
- `categoryId` 必须是启用中的系统分类
- `warranty.endDate >= warranty.startDate`，日期需成对填写或全部清空
- `purchaseDate` 不能晚于当前业务日期，且必须是实际存在的日历日期
- 价格不能为负且不能超过数据库整数分上限
- 当前 MVP 币种固定为 `CNY`

实现说明：设备创建/更新与保修同步由 `gearflow-api` 编排；归属取可信 OPENID，时间线事件由云函数追加。客户端不持有 MySQL 连接或写权限。

编辑表单加载完成前不允许保存。保修读取失败与“没有保修”必须区分：失败时显示重试并禁止覆盖；未改动保修字段发送 `KEEP`，只有用户明确清空已加载的日期才发送 `CLEAR`。

保修响应格式错误不能转为“没有保修”。详情页同样分别呈现保修加载、空数据与失败重试状态。

### 7.4 更新设备

```text
device.update
```

支持部分更新。业务字段确实变化时，云函数追加 `UPDATED` 事件；状态转为 `SOLD / DISCARDED` 时追加处置相关事件。事件摘要只包含变更字段名，不包含变更前后原值。

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

MVP 为软删除，默认列表和统计不再显示。`device.delete` 由云函数校验归属后置 `deleted_at`，后续列表、详情、时间线与统计均过滤已删除设备。

## 8. 维护记录接口

### 8.1 维护记录列表

```text
maintenance.list
```

请求为 `deviceId`、`page`、`pageSize`（默认 20、最大 50），响应使用通用 `PageResult`，固定按 `occurredAt DESC, createdAt DESC, id DESC` 排序。编辑记录使用 `maintenance.get(deviceId, id)` 单条查询，不能从第一页定位记录。

当前单设备详情由服务层每批最多 50 条读齐，再每次展示 20 条；维护费用合计和导出使用完整结果，任何一页失败都不能当作完整列表。此处不增加数据库 RPC；首页与全局统计由云函数聚合。

每次返回详情触发刷新时，立即使旧合计与导出失效；只有当前轮次的完整读取成功后才能重新展示合计和导出。较早轮次或退出前发起的响应不能覆盖当前结果。

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

维护记录写操作在 `gearflow-api` 内再次校验标题、类型、日期、金额、长度、设备归属和软删除状态；失败时执行补偿清理。成功后同步：

- 时间线（payload 仅含非敏感摘要，不含费用）
- 统计成本表（`MAINTENANCE` 行以 `maintenanceId` 唯一关联）

## 9. 时间线接口

```text
timeline.list
```

查询参数：

| 参数      | 类型   | 说明                                                        |
| --------- | ------ | ----------------------------------------------------------- |
| deviceId  | string | 设备 ID，必填；云函数仍强制校验 OPENID 归属                 |
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

实现约束：统计由 `gearflow-api` 执行，服务端从 OPENID 绑定用户，不接受客户端传入的 `userId`。所有统计过滤 `deleted_at IS NULL`。

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
- `currency`：当前 MVP 固定 `CNY`（数据库约束保证单币种）；金额均以整数分返回，前端负责千分位与符号展示。多币种需先补充分桶/换算契约后再放开。
- 日期范围无效时，前端回退为当年 1 月 1 日至 12 月 31 日；服务端仍会拒绝无法解析的日期参数。

## 11. 扩展功能与预留接口

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

### CSV 导出（已实现）

```text
buildDevicesCsv / buildMaintenanceCsv
saveAndShareCsv
clearGeneratedExports
```

附件和提醒已在自用体验版实现。CSV 导出支持：本人设备及单设备维护数据经云函数读取，本机生成 CSV 后交给微信分享；分享结束或取消后清理临时文件，退出和注销再次清理历史遗留文件。导出不构成可恢复的数据库备份。

这里是客户端本机导出，不存在远程导出任务；原规划的 `export.create` / `export.get` 仍未实现。

## 12. 未来 REST 映射

如果未来采用 CloudBase 云托管 + NestJS，本文件中的业务操作可映射为 `/api/v1` REST 路径。届时再定义 HTTP 状态码、JWT 或服务间认证、限流和版本治理；当前阶段不实现也不安装相关依赖。
