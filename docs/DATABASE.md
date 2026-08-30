# GearFlow 逻辑数据模型与 CloudBase 存储设计

## 1. 设计原则

1. 服务 MVP，不为“看起来专业”增加无用表。
2. 金额统一使用整数分存储，避免浮点误差。
3. 所有用户数据必须强制关联 `userId`。
4. 日期只保存日期，不保存无意义时间。
5. 附件为 P1 功能，但数据结构提前预留。
6. 账号注销必须删除或匿名化用户数据。
7. 设备删除使用软删除，用户主动清除和账号注销使用物理删除或匿名化。

当前实现使用 CloudBase 文档型数据库。下文首先定义与存储技术无关的逻辑实体，再说明集合、查询索引和权限实现。字段长度、枚举和值域属于业务约束，由前端校验和云函数共同执行，不依赖 MySQL 或 Prisma。

## 2. CloudBase 实现原则

- 每个逻辑实体映射为一个 CloudBase 集合，文档使用 `_id` 作为当前存储主键。
- `userId` 由 CloudBase 可信身份上下文生成，客户端不能指定或覆盖。
- 设备与保修、维护、时间线、成本之间通过字符串引用 ID 关联。
- 安全规则负责基础读写边界；跨集合写入、统计和删除由云函数负责。
- 根据实际查询组合创建普通或组合索引，不照搬关系型数据库索引语法。
- 不依赖数据库外键和级联删除，引用完整性由云函数校验。
- 数据结构保留稳定业务 ID、明确时间字段和扁平引用，便于未来迁移到 PostgreSQL / MySQL。

## 3. 实体总览

```text
User 1─n Device
User 1─n DeviceCategory
Device 1─n MaintenanceRecord
Device 1─1 Warranty
Device 1─n Attachment
Device 1─n DeviceTimeline
Device 1─n DeviceCost
User 1─n ConsentRecord
```

## 4. 集合设计

### 4.1 User / `users`

| 字段        | 类型            | 说明                                     |
| ----------- | --------------- | ---------------------------------------- |
| id          | string          | 逻辑主键，当前可与 `_id` 相同            |
| identityId  | string          | CloudBase 可信用户标识，不下发给其他用户 |
| openid      | string nullable | 仅在业务确实需要时由服务端保存           |
| unionid     | string nullable | 未来开放平台使用                         |
| nickname    | string nullable | 展示昵称                                 |
| avatarUrl   | string nullable | 头像地址                                 |
| status      | string enum     | ACTIVE / DELETING / DELETED              |
| lastLoginAt | timestamp       | 最近登录                                 |
| createdAt   | timestamp       | 创建时间                                 |
| updatedAt   | timestamp       | 更新时间                                 |

索引：

- `_id` 文档主键
- `identityId` 单字段查询索引
- `identityId` 唯一性由确定性 `_id` 或云函数创建流程保证

说明：

- 优先使用 CloudBase 可信身份标识，OpenID 不作为客户端鉴权参数。
- OpenID 不返回给前端。
- 昵称和头像可选，能不收集就不收集。

### 4.2 DeviceCategory / `deviceCategories`

| 字段      | 类型            | 说明                                       |
| --------- | --------------- | ------------------------------------------ |
| id        | string          | 逻辑主键                                   |
| scope     | string enum     | SYSTEM / CUSTOM                            |
| ownerKey  | string          | 系统分类为 `system`，自定义分类为 `userId` |
| userId    | string nullable | 仅自定义分类填写                           |
| code      | string          | 分类代码                                   |
| name      | string          | 分类名称                                   |
| sortOrder | int             | 排序                                       |
| isActive  | boolean         | 是否启用                                   |
| createdAt | timestamp       | 创建时间                                   |
| updatedAt | timestamp       | 更新时间                                   |

索引：

- `_id` 文档主键
- 组合查询索引：`scope + isActive + sortOrder`
- `ownerKey + code` 的业务唯一性由初始化或云函数校验保证

说明：

系统分类内置电脑、手机、平板、显示器、耳机、键盘、鼠标、相机、游戏机、NAS、硬盘、其他。MVP 只启用 `SYSTEM`，自定义分类属于后续扩展。

### 4.3 Device / `devices`

| 字段               | 类型                 | 说明                             |
| ------------------ | -------------------- | -------------------------------- |
| id                 | string               | 逻辑主键                         |
| userId             | string               | 所属用户，由可信身份写入         |
| categoryId         | string               | 分类引用                         |
| name               | string               | 设备名称，必填，最长 64 字符     |
| brand              | string nullable      | 品牌                             |
| model              | string nullable      | 型号                             |
| serialNumber       | string nullable      | 序列号                           |
| status             | string enum          | IN_USE / IDLE / SOLD / DISCARDED |
| purchaseDate       | date string nullable | 购买日期，格式 `YYYY-MM-DD`      |
| purchaseChannel    | string nullable      | 购买渠道                         |
| purchasePriceCents | int nullable         | 购买价格，单位分                 |
| currency           | string               | ISO 4217 币种，默认 CNY          |
| disposalDate       | date string nullable | 处置日期                         |
| disposalPriceCents | int nullable         | 处置收入，单位分                 |
| notes              | string nullable      | 备注，最长 1000 字符             |
| deletedAt          | timestamp nullable   | 软删除                           |
| createdAt          | timestamp            | 创建时间                         |
| updatedAt          | timestamp            | 更新时间                         |

索引：

- `_id` 文档主键
- 组合查询索引：`userId + deletedAt + status`
- 组合查询索引：`userId + categoryId + deletedAt`
- 组合查询索引：`userId + purchaseDate`

约束：

- `purchasePriceCents >= 0`
- `disposalPriceCents >= 0`
- `disposalDate >= purchaseDate`

序列号为敏感字段，只返回给数据拥有者，且日志禁止输出。

### 4.4 Warranty / `warranties`

| 字段      | 类型                 | 说明       |
| --------- | -------------------- | ---------- |
| id        | string               | 逻辑主键   |
| deviceId  | string               | 设备引用   |
| userId    | string               | 所属用户   |
| startDate | date string nullable | 开始日期   |
| endDate   | date string nullable | 结束日期   |
| provider  | string nullable      | 保修提供方 |
| scope     | string nullable      | 保修范围   |
| notes     | string nullable      | 备注       |
| createdAt | timestamp            | 创建时间   |
| updatedAt | timestamp            | 更新时间   |

索引：

- `_id` 文档主键
- `deviceId` 单字段查询索引；一设备一保修由云函数保证
- 组合查询索引：`userId + endDate`

校验：

- `endDate >= startDate`
- 保修状态不落库，按当前日期计算，避免数据过期。

### 4.5 MaintenanceRecord / `maintenanceRecords`

| 字段       | 类型            | 说明                                                 |
| ---------- | --------------- | ---------------------------------------------------- |
| id         | string          | 逻辑主键                                             |
| deviceId   | string          | 设备引用                                             |
| userId     | string          | 所属用户                                             |
| title      | string          | 标题                                                 |
| type       | string enum     | REPAIR / UPGRADE / CLEAN / REPLACE / INSPECT / OTHER |
| occurredAt | date string     | 发生日期                                             |
| costCents  | int nullable    | 费用                                                 |
| vendor     | string nullable | 服务商                                               |
| notes      | string nullable | 备注                                                 |
| createdAt  | timestamp       | 创建时间                                             |
| updatedAt  | timestamp       | 更新时间                                             |

索引：

- `_id` 文档主键
- 组合查询索引：`deviceId + occurredAt`
- 组合查询索引：`userId + occurredAt + type`

约束：

- `costCents >= 0`
- `occurredAt >= device.purchaseDate`（如果购买日期存在）

### 4.6 Attachment / `attachments`

P1 表，MVP 不启用。

| 字段      | 类型        | 说明                                             |
| --------- | ----------- | ------------------------------------------------ |
| id        | string      | 逻辑主键                                         |
| deviceId  | string      | 设备引用                                         |
| userId    | string      | 所属用户                                         |
| kind      | string enum | PHOTO / INVOICE / WARRANTY / MAINTENANCE / OTHER |
| fileId    | string      | CloudBase 云存储文件引用                         |
| mimeType  | string      | 文件类型                                         |
| sizeBytes | int         | 文件大小                                         |
| sha256    | string      | 文件哈希                                         |
| createdAt | timestamp   | 创建时间                                         |

索引：

- `_id` 文档主键
- 组合查询索引：`deviceId + kind`
- `userId` 查询索引

要求：

- 使用 CloudBase 云存储，不在数据库中保存二进制文件
- 不使用原始文件名作为云存储路径
- 上传前限制类型和大小
- 访问必须经过短期授权
- 删除设备或账号时同步删除对象

### 4.7 DeviceTimeline / `deviceTimelines`

| 字段        | 类型            | 说明                                                  |
| ----------- | --------------- | ----------------------------------------------------- |
| id          | string          | 逻辑主键                                              |
| deviceId    | string          | 设备引用                                              |
| userId      | string          | 所属用户                                              |
| eventType   | string enum     | CREATED / UPDATED / MAINTENANCE / WARRANTY / DISPOSED |
| eventDate   | date string     | 事件日期                                              |
| title       | string          | 标题                                                  |
| description | string nullable | 描述                                                  |
| payload     | object nullable | 非敏感摘要                                            |
| createdAt   | timestamp       | 创建时间                                              |

索引：

- `_id` 文档主键
- 组合查询索引：`deviceId + eventDate`
- 组合查询索引：`userId + eventDate`

说明：

时间线不保存敏感字段原文，序列号和附件地址只保存引用 ID。

### 4.8 DeviceCost / `deviceCosts`

| 字段        | 类型        | 说明                                     |
| ----------- | ----------- | ---------------------------------------- |
| id          | string      | 逻辑主键                                 |
| deviceId    | string      | 设备引用                                 |
| userId      | string      | 用户                                     |
| costType    | string enum | PURCHASE / MAINTENANCE / DISPOSAL_INCOME |
| amountCents | int         | 金额分                                   |
| occurredAt  | date string | 日期                                     |
| createdAt   | timestamp   | 创建时间                                 |

索引：

- `_id` 文档主键
- 组合查询索引：`userId + costType + occurredAt`
- `deviceId` 查询索引

用途：

统计设备年度支出、维护成本和净成本。写入来源：

- 设备购买价
- 维护费用
- P1 处置收入

### 4.9 ConsentRecord / `consentRecords`

| 字段        | 类型        | 说明            |
| ----------- | ----------- | --------------- |
| id          | string      | 逻辑主键        |
| userId      | string      | 用户            |
| policyType  | string enum | PRIVACY / TERMS |
| version     | string      | 版本            |
| consentedAt | timestamp   | 同意时间        |

索引：

- `_id` 文档主键
- 组合查询索引：`userId + policyType + version`

用途：

证明用户同意特定版本协议，满足上线与审计需要。

## 5. 删除策略

### 删除设备

1. 设置 `Device.deletedAt`
2. 保修、维护、时间线默认不物理删除
3. 列表与统计默认过滤软删除
4. P1 可提供“彻底删除”

### 账号注销

必须执行：

1. 删除用户可识别资料
2. 删除设备、保修、维护、附件、时间线、成本、同意记录
3. 删除 CloudBase 云存储文件
4. 清理客户端登录态和 GearFlow 用户会话状态
5. 将 User 身份映射替换为不可逆随机值，并标记 `DELETED`
6. 写入不可关联用户的审计摘要

账号注销由云函数统一编排。对支持原子或事务操作的范围使用平台能力；跨数据库与云存储的删除采用幂等步骤和可恢复状态：

```text
标记 DELETING
→ 分批删除用户集合数据
→ 删除 CloudBase 云存储文件
→ 匿名化 User 身份映射
→ 标记 DELETED
```

P1 引入附件后，云存储删除失败任务写入 CloudBase 删除任务集合，并由云函数重试，不能静默丢失。

## 6. 用户数据隔离

所有业务表均冗余 `userId`，原因：

1. 查询无需多表 join 即可强制过滤用户
2. 统计更直接
3. 删除账号更容易

云函数查询规则：

```text
WHERE id = :resourceId AND userId = :currentUserId
```

禁止：

- 只按资源 ID 查询
- 信任前端 userId
- 在日志中输出敏感字段

数据库安全规则至少保证：

- 公共系统分类只读
- 用户集合数据仅拥有者可读
- 涉及多集合一致性、敏感字段或删除的写操作只能通过云函数
- 管理端权限不暴露给小程序客户端

## 7. 查询与统计实现

### 基础统计

CloudBase 查询或聚合能力：

- 设备数量：计数查询或聚合
- 总资产：聚合 `purchasePriceCents`
- 年度支出：按购买和维护日期统计
- 维护支出：`SUM(costCents)`
- 分类占比：按 category 分组
- 使用年限：当前日期减购买日期

### 统计口径

- 金额使用分
- 默认统计未软删除设备
- 处置收入 P1 后计入净成本
- 空值不参与金额汇总
- 时间范围使用用户本地日期，由前端传日期参数

复杂统计由云函数执行并统一校验 `userId`。如果数据规模增长后文档数据库聚合不再满足性能或复杂关系查询需求，再评估 CloudBase 云托管中的 NestJS + Prisma + PostgreSQL / MySQL；当前不提前引入。

## 8. 未来关系型数据库迁移

为保持可迁移性：

- 使用稳定字符串 ID，不把业务关系绑定到 CloudBase 特有对象结构
- 关系字段统一使用 `deviceId`、`userId` 等显式引用
- 日期、金额和枚举保持明确格式
- 云函数内集中封装数据访问，避免页面散落复杂数据库表达式
- 定期保留可验证的数据导出方案

未来迁移是需求驱动的可选路线，不是当前 Roadmap 的必做项。
