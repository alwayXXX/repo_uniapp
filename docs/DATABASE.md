# GearFlow 逻辑数据模型与 CloudBase 存储设计

## 1. 设计原则

1. 服务 MVP，不为“看起来专业”增加无用表。
2. 金额统一使用整数分存储，避免浮点误差。
3. 所有用户数据必须强制关联 `userId`。
4. 日期只保存日期，不保存无意义时间。
5. 附件为 P1 功能，但数据结构提前预留。
6. 账号注销必须删除或匿名化用户数据。
7. 设备删除使用软删除，用户主动清除和账号注销使用物理删除或匿名化。

> **2026-10-07 当前实现**：`myrepo-d7go4fyg918beac63` 使用 CloudBase MySQL 8.0 Serverless。当前 schema 见 `database/mysql/schema.sql`，业务详情见 `docs/MYSQL-MIGRATION.md`。下文 PG、RLS、RPC、`auth.uid()` 段落保留为 Phase 0-10 历史设计，不再代表当前环境。

当前实现使用 **CloudBase MySQL**。用户归属列为 `openid`，由 `gearflow-api` 云函数从微信运行环境注入，客户端无法指定。客户端不直连数据库，所有业务读写统一通过云函数完成。

## 2. CloudBase MySQL 实现原则

- 每个逻辑实体映射为一张 MySQL 表，物理列使用 snake_case，服务层负责 camelCase 映射。
- `id` 使用应用生成的 UUID 字符串主键；用户业务表使用 `openid varchar(128)` 作为归属列。
- 表与保修、维护、时间线、成本之间使用外键维持引用完整性；软删除保留设备行，账号注销按依赖顺序删除或匿名化。
- 微信小程序通过 `wx.cloud.callFunction('gearflow-api')` 调用；云函数读取可信 OPENID 后，所有查询和写入都附加 `openid` 条件。
- Node SDK 使用 `app.rdb()` 访问 MySQL；JSON 字段写入前序列化为字符串。
- 按实际查询组合创建普通或组合索引。

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

| 字段               | 类型                 | 说明                                                  |
| ------------------ | -------------------- | ----------------------------------------------------- |
| id                 | string               | 逻辑主键                                              |
| userId             | string               | 所属用户，由可信身份写入                              |
| categoryId         | string               | 分类引用                                              |
| name               | string               | 设备名称，必填，最长 64 字符                          |
| brand              | string nullable      | 品牌                                                  |
| model              | string nullable      | 型号                                                  |
| serialNumber       | string nullable      | 序列号                                                |
| status             | string enum          | IN_USE / IDLE / SOLD / DISCARDED                      |
| purchaseDate       | date string nullable | 购买日期，格式 `YYYY-MM-DD`                           |
| purchaseChannel    | string nullable      | 购买渠道                                              |
| purchasePriceCents | int nullable         | 购买价格，单位分                                      |
| currency           | string               | 当前 MVP 固定为 `CNY`；多币种需先补统计分桶与换算契约 |
| disposalDate       | date string nullable | 处置日期                                              |
| disposalPriceCents | int nullable         | 处置收入，单位分                                      |
| notes              | string nullable      | 备注，最长 1000 字符                                  |
| deletedAt          | timestamp nullable   | 软删除                                                |
| createdAt          | timestamp            | 创建时间                                              |
| updatedAt          | timestamp            | 更新时间                                              |

索引：

- `_id` 文档主键
- 组合查询索引：`userId + deletedAt + status`
- 组合查询索引：`userId + categoryId + deletedAt`
- 组合查询索引：`userId + purchaseDate`

约束：

- `purchasePriceCents >= 0`
- `disposalPriceCents >= 0`
- `disposalDate >= purchaseDate`
- `currency = 'CNY'`（当前 MVP 单币种约束，避免统计把不可比金额直接相加）
- `categoryId` 必须指向启用中的系统分类

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
- `deviceId` 单字段查询索引；一设备一保修由唯一约束保证
- 组合查询索引：`userId + endDate`

校验：

- `endDate >= startDate`
- 保修状态不落库，按当前日期计算，避免数据过期。
- 客户端只能读取；新增、更新和清除由设备保存事务 RPC 一并完成。

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
- `title` 去空白后不能为空；`type` 必须属于维护类型枚举。
- 客户端只能读取；写入必须通过维护生命周期 RPC，避免绕过成本和时间线联动。

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

### 4.7 DeviceTimeline / `deviceTimelines`（PG：`device_timelines`）

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
- 组合查询索引：`deviceId + eventDate desc + createdAt desc`
- 组合查询索引：`userId + eventDate desc + createdAt desc`

说明：

- 时间线为 append-only 业务日志，小程序客户端仅有 `SELECT` 权限。
- Phase 6 由 `devices` 表触发器生成 `CREATED / UPDATED / DISPOSED`；`MAINTENANCE / WARRANTY` 仅保留契约，Phase 7 的可信写路径再生成。
- 业务字段变化默认生成 `UPDATED`；状态转为 `SOLD / DISCARDED` 时生成 `DISPOSED`，仅 `updatedAt` 变化不生成事件。
- `CREATED.eventDate` 优先使用购买日期，未填写时使用业务时区当日；其他设备事件使用 `Asia/Shanghai` 当日。
- 展示顺序固定为 `eventDate DESC, createdAt DESC`，保证同日多事件稳定。
- `payload` 只保存 `changedFields` 等字段名摘要；不保存序列号、价格、备注、附件地址或任何变更前后原值。
- RLS 同时要求 `user_id = auth.uid()` 且关联设备 `deleted_at IS NULL`；设备软删除后历史行保留但客户端不可见。

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

统计设备年度支出、维护成本和净成本。当前 MVP 只允许 `MAINTENANCE` 行，`PURCHASE` 与 `DISPOSAL_INCOME` 仍作为未来 P1 处置/记账能力的保留枚举，但当前 Phase 8 不写入这两类行：

- 购买支出直接读取设备的 `purchasePriceCents`，按 `purchaseDate` 聚合
- 维护支出读取 `MAINTENANCE` 行
- P1 处置收入暂不计入当前统计

`maintenanceId` 为每条维护成本的幂等键并带外键；同一设备同日同金额的多条维护记录不会互相冲突。当前设备表固定 `CNY`，因此成本行继承设备币种且统计金额可直接比较。

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

账号注销由 PostgreSQL `SECURITY DEFINER` RPC 统一编排。当前数据库范围在一个事务内按“保修 → 成本 → 维护 → 时间线 → 设备 → 同意记录 → 用户匿名化”执行；附件/云存储接入后再扩展为幂等任务流：

```text
删除业务表数据
→ 匿名化 User 身份映射
→ 标记 DELETED
```

P1 引入附件后，云存储删除失败任务写入 CloudBase 删除任务集合，并由云函数重试，不能静默丢失。

客户端补充约束（2026-09-23）：退出与注销同时清理业务 Store、筛选缓存、协议版本标记和本应用生成的 CSV 临时文件；已分享至其他应用的副本由用户管理。过期的异步请求不能在清理后重新填充数据。本轮不改变云端删除顺序或 RLS。

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
- 总资产：直读未软删除设备的 `purchasePriceCents`
- 购买支出：按设备 `purchaseDate` 落在日期范围内的购买价格聚合
- 维护支出：只聚合 `MAINTENANCE` 成本行的 `SUM(amountCents)`
- 分类占比：按 category 分组
- 使用年限：当前日期减购买日期

### 统计口径

- 金额使用分
- 默认统计未软删除设备
- 处置收入 P1 后计入净成本
- 空值不参与金额汇总
- 时间范围使用用户本地日期，由前端传日期参数

复杂统计由 CloudBase PostgreSQL `SECURITY DEFINER` RPC 执行，并统一从 `auth.uid()` 派生用户身份；客户端不传入或信任 `userId`。如果数据规模增长后当前 RPC 聚合不再满足性能或复杂关系查询需求，再评估 CloudBase 云托管中的 NestJS + Prisma + PostgreSQL / MySQL；当前不提前引入。

## 8. 未来关系型数据库迁移

为保持可迁移性：

- 使用稳定字符串 ID，不把业务关系绑定到 CloudBase 特有对象结构
- 关系字段统一使用 `deviceId`、`userId` 等显式引用
- 日期、金额和枚举保持明确格式
- 云函数内集中封装数据访问，避免页面散落复杂数据库表达式
- 定期保留可验证的数据导出方案

未来迁移是需求驱动的可选路线，不是当前 Roadmap 的必做项。

## 9. Phase 1 表结构与 RLS 基线

Phase 1 仅创建 `users` 与 `devices` 两张表验证链路，其余实体在对应 Phase 按同一模式建表。

### 9.1 users

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id varchar(64) NOT NULL UNIQUE,   -- CloudBase 可信身份 UID（auth.uid()），服务端写入
  nickname varchar(64),
  avatar_url text,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

RLS：客户端仅能 `SELECT` 自己的行（`identity_id = auth.uid()`）；`INSERT/UPDATE/DELETE` 不开放给客户端，由**服务端边界**执行——身份初始化、资料更新和注销均通过 `SECURITY DEFINER` RPC，身份强制取 `auth.uid()`，客户端无法伪造。

### 9.2 devices

```sql
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(64) NOT NULL DEFAULT auth.uid(),  -- 归属由数据库默认值写入，客户端不可指定
  category_id uuid NOT NULL,                         -- 外键 → device_categories.id（仅启用系统分类）
  name varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'IN_USE',      -- IN_USE / IDLE / SOLD / DISCARDED
  brand varchar(64),
  model varchar(128),
  serial_number varchar(128),
  purchase_date date,
  purchase_channel varchar(128),
  purchase_price_cents integer,
  currency varchar(8) NOT NULL DEFAULT 'CNY',
  disposal_date date,
  disposal_price_cents integer,
  notes varchar(1000),
  deleted_at timestamptz,                            -- 软删除标记
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON devices (user_id);
CREATE INDEX idx_devices_user_status ON devices (user_id, deleted_at, status);
CREATE INDEX idx_devices_user_category ON devices (user_id, category_id, deleted_at);
CREATE INDEX idx_devices_user_purchase ON devices (user_id, purchase_date);
```

RLS：设备表 `devices_select_own` 限定本人，`deleted_at IS NULL` 由设备列表、详情查询与统计额外过滤；关联保修、维护、成本和时间线的 RLS 同时检查设备未软删除。`INSERT/UPDATE/DELETE` 不授予客户端，由 `gf_save_device_with_warranty` 与 `gf_soft_delete_device` 以 `auth.uid()` 校验后执行。删除 = 软删除（置 `deleted_at`），并非物理删除设备行。

### 9.2.1 device_categories（Phase 4）

```sql
CREATE TABLE device_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(16) NOT NULL DEFAULT 'SYSTEM',      -- SYSTEM / CUSTOM（MVP 仅 SYSTEM）
  owner_key varchar(64) NOT NULL DEFAULT 'system',
  code varchar(32) NOT NULL,
  name varchar(32) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, code)
);
```

系统分类内置 12 项（电脑/手机/平板/显示器/耳机/键盘/鼠标/相机/游戏机/NAS/硬盘/其他）。RLS：`authenticated` 仅可 `SELECT` 且限 `scope='SYSTEM' AND is_active`；客户端无任何写权限。自定义分类（`CUSTOM`）属后续扩展。

### 9.3 权限基线

- 授权仅面向 `authenticated` 角色（已登录用户）；`anon` 无任何授权，默认拒绝。
- 客户端只允许持有 Publishable Key；`service_role` / API Key 仅存在于服务端。
- RLS 验证以数据库策略为准，UI 隐藏不作为权限手段。

### 9.4 身份生命周期 RPC（Phase 3）

用户行的创建与注销通过 `SECURITY DEFINER` RPC 函数实现（客户端经 `rdb.rpc()` 调用，函数以表属主权限运行、绕过 RLS，但身份只能来自 JWT）：

- **`gf_bootstrap_user(p_privacy text, p_terms text)`**：upsert 当前 `auth.uid()` 的用户行（首次创建 / 更新 `last_login_at`），按传入版本幂等写入 `consent_records`，返回 `{ user: { id, nickname, avatarUrl, isNewUser } }`（API.md 3.1 契约）。函数内 `EXECUTE` 权限仅授予 `authenticated`。
- **`gf_delete_account()`**：在单事务内物理删除当前身份的 `warranties`、`device_costs`、`maintenance_records`、`device_timelines`、`devices` 与 `consent_records`，再将用户行匿名化（`identity_id` 替换为 `deleted:<uuid>`、昵称头像清空、`status = 'DELETED'`），返回各表删除统计。匿名化后旧 JWT 自动失配 RLS，数据不可访问；再次登录会创建全新用户（DATABASE.md 第 5 节语义）。
- **`gf_update_profile(p_nickname text, p_avatar_url text)`**：仅更新当前身份可编辑的昵称/头像字段，避免客户端直接修改 `identity_id` 或 `status`。
- **`gf_save_device_with_warranty(...)`**：在一个事务内创建/更新设备并同步一设备一保修；设备写入触发器仍负责时间线事件，保修清除通过同一 RPC 完成。
- **`gf_soft_delete_device(p_id text)`**：校验当前身份后执行设备软删除；设备及保修、维护、成本、时间线历史行保留，但因 RLS/统计过滤不再对用户可见。
- `auth-bootstrap` 云函数（wx.cloud 文档数据库变体）已被上述 RPC 取代并删除。

### 9.5 consent_records（Phase 3）

```sql
CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(64) NOT NULL DEFAULT auth.uid(),  -- 与全库约定一致：存 auth.uid()
  policy_type varchar(16) NOT NULL,                 -- PRIVACY / TERMS
  policy_version varchar(16) NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, policy_type, policy_version)
);
```

RLS：客户端仅可 `SELECT` 本人记录；`INSERT/UPDATE/DELETE` 均不授予客户端，由身份初始化/注销 RPC 维护。同意记录不可篡改，仅随账号注销物理删除。协议正文为静态法律文本，由前端常量维护（`src/constants/policies.ts`），数据库只记录版本与时间。

仅用户显式确认协议时调用带版本的 bootstrap RPC。普通会话恢复只查询当前用户，不写同意记录；本机版本标记只控制引导，不参与数据库鉴权。

### 9.6 device_timelines（Phase 6）

```sql
CREATE TABLE device_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  user_id varchar(64) NOT NULL,
  event_type varchar(16) NOT NULL,
  event_date date NOT NULL,
  title varchar(64) NOT NULL,
  description varchar(256),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS：`authenticated` 仅可查询本人且关联设备未软删除的行；不授予直接写权限。`gf_append_device_timeline()` 为不对客户端暴露执行权的 `SECURITY DEFINER` 触发器函数，只从设备受保护写入生成事件。旧设备在迁移时幂等回填一条 `CREATED`。

### 9.6 maintenance_records（Phase 7）

```sql
CREATE TABLE maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,                         -- 复合外键 (device_id,user_id) → devices(id,user_id)
  user_id varchar(64) NOT NULL DEFAULT auth.uid(),
  title varchar(64) NOT NULL,
  type varchar(16) NOT NULL CHECK (type IN ('REPAIR','UPGRADE','CLEAN','REPLACE','INSPECT','OTHER')),
  occurred_at date NOT NULL,
  cost_cents integer CHECK (cost_cents IS NULL OR cost_cents >= 0), -- 可空；单位分
  vendor varchar(128),
  notes varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_device_date ON maintenance_records (device_id, occurred_at);
CREATE INDEX idx_maint_user_date_type ON maintenance_records (user_id, occurred_at, type);
```

RLS：客户端仅可查询本人且关联设备未软删除的行；`INSERT/UPDATE/DELETE` 不授予客户端。校验规则（docs/API.md 8）：标题去空白后必填 ≤64；发生日期必填、不晚于当前业务日期、不早于设备购买日期；费用 ≥0 两位小数。服务端 RPC 在写入前再次校验，失败时不产生部分写入。

**与时间线/成本表的联动由 `SECURITY DEFINER` RPC 保证**（见 9.8）：新增维护原子地追加一条 `MAINTENANCE` 时间线事件并写入 `device_costs`；更新/删除维护精确按 `maintenance_id` 同步成本行。时间线 payload 只保留非敏感摘要，不写入费用。

### 9.7 device_costs（Phase 7，Phase 8 统计口径）

```sql
CREATE TABLE device_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  user_id varchar(64) NOT NULL DEFAULT auth.uid(),
  cost_type varchar(16) NOT NULL CHECK (cost_type = 'MAINTENANCE'),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  occurred_at date NOT NULL,
  maintenance_id uuid NOT NULL,                     -- 溯源：MAINTENANCE 行指向来源维护记录
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maintenance_id)
);
CREATE INDEX idx_costs_user_type_date ON device_costs (user_id, cost_type, occurred_at);
```

RLS：客户端仅可查询本人且关联设备未软删除的行；写权限不开放给客户端。当前口径只保留由维护 RPC 原子写入的 `MAINTENANCE` 行，并通过 `maintenance_id` 溯源（更新/删除维护时精确定位同步）；**不写入也不依赖 `PURCHASE` 行**。总资产统一直读 `devices.purchase_price_cents`（过滤 `deleted_at IS NULL`），购买支出 `purchase_spend` 按 `devices.purchase_date` 聚合；`device_costs` 仅用于维护支出统计。当前设备币种固定为 `CNY`，避免把不可比较的多币种金额直接相加。`PURCHASE` 与 `DISPOSAL_INCOME` 为未来 P1 保留枚举，不代表当前写入或统计来源。唯一约束使用 `maintenance_id`，同一设备同日同金额的多条维护记录不会互相冲突。

### 9.8 维护记录生命周期 RPC（Phase 7）

- **`gf_add_maintenance(p_device_id, p_title, p_type, p_occurred_at, p_cost_cents, p_vendor, p_notes)`**：校验当前身份、设备归属/未软删除状态、标题/类型/日期/金额/长度后原子完成：写 `maintenance_records` → 写 `device_costs`（`MAINTENANCE`，金额非空时）→ 追加 `MAINTENANCE` 时间线事件（payload 仅含非敏感摘要）。返回 `{ ok, id, errorCode? }`。
- **`gf_update_maintenance(p_id, ...同上字段)`**：先锁定本人且关联活动设备的维护行，再更新维护行并按 `maintenance_id` 精确替换成本行；无记录返回 `{ ok:false, errorCode:'RESOURCE_NOT_FOUND' }`。
- **`gf_delete_maintenance(p_id)`**：先删除对应成本行，再删除本人维护行；无记录不删除任何成本，返回 `{ ok, deletedCosts }`。
- 三者均 `SECURITY DEFINER`，执行权仅授予 `authenticated`；客户端不再拥有维护表写权限。

### 9.9 warranties（Phase 7）

```sql
CREATE TABLE warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL UNIQUE,                  -- 一设备一保修（docs/DATABASE.md 4.4）
  user_id varchar(64) NOT NULL DEFAULT auth.uid(),
  start_date date,
  end_date date NOT NULL,
  provider varchar(128),
  scope varchar(256),
  notes varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_warranty_user_end ON warranties (user_id, end_date);
```

RLS：客户端仅可查询本人且关联设备未软删除的行；`INSERT/UPDATE/DELETE` 不授予客户端，由 `gf_save_device_with_warranty` 在设备事务中维护。**保修状态不落库**，客户端按 `end_date` 实时计算（`IN_WARRANTY`/`EXPIRING`（≤30 天）/`EXPIRED`/`UNKNOWN`），首页临期看板据此生成。

### 9.10 当前身份列与隔离测试

- 2026-09-06 的 `ops_seven_widen_uid_columns_retry` 将 `users.identity_id` 及六张业务表的 `user_id` 放宽为 `varchar(255)`；以上历史建表片段不代表当前长度仍为 64。
- 本轮不新增线上迁移。数据库回归仅在测试专用的内存 PostgreSQL（PGlite）执行，重放仓库迁移并模拟 CloudBase 的 `auth.uid()`、角色和建表默认授权。
- 历史文件 `20260830141710_gearflow_phase_one_tables.sql` 含两条语句，当时 runner 只执行第一条；随后 `20260830141730` 单独建 devices。测试须显式记录这一历史例外，不修改已应用的迁移原文，也不能把忽略失败推广到其他迁移。
- 隔离测试验证 SQL 约束、RLS、RPC 权限和注销残留；不替代真实 CloudBase 身份签发、线上 schema 漂移或生产配置验收。
