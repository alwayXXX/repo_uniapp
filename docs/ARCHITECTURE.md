# GearFlow 技术架构文档

## 1. 总体结论

GearFlow 第一阶段采用 CloudBase BaaS 架构，将基础设施维护交给托管云能力，同时保留清晰的业务边界：

```text
微信小程序
  └─ uni-app
      └─ Vue 3 + TypeScript + Pinia
          └─ CloudBase
              ├─ PostgreSQL 数据库（RLS 行级安全）
              ├─ 云函数 / 可信业务逻辑
              ├─ 云存储（P1 附件）
              ├─ 微信用户身份（signInWithOpenId）
              └─ 日志、监控及其他按需云能力
```

当前使用规模是本人和少量朋友。第一阶段不购买独立服务器，不自行部署关系型数据库、Nginx 或 HTTPS 基础设施，将开发精力集中在产品和数据安全上。

> **存储引擎决策（2026-08-30）**：开发环境为 CloudBase PG 模式（无文档型数据库实例），数据层使用平台托管的 CloudBase PostgreSQL + RLS。该调整仅为存储引擎替换，业务分层不变；详见 `docs/DATABASE.md` 存储引擎决策说明。

### 必要性判断

| 技术               | 第一阶段是否使用 | 原因                                           |
| ------------------ | ---------------- | ---------------------------------------------- |
| uni-app            | 使用             | 指定小程序第一发布平台                         |
| Vue 3              | 使用             | Composition API 适合复杂表单和状态复用         |
| TypeScript strict  | 使用             | 降低接口和业务模型错误率                       |
| Pinia              | 使用             | 管理用户、设备列表、筛选和统计状态             |
| CloudBase          | 使用             | 承担身份、数据、云函数、云存储和托管运维能力   |
| CloudBase 数据库   | 使用             | 保存账号、设备、维护、时间线和统计相关数据     |
| CloudBase 云函数   | 使用             | 承担可信身份、业务校验、多集合写入、统计和注销 |
| CloudBase 云存储   | P1               | 保存设备照片、发票和维修凭证，不在 MVP 启用    |
| NestJS             | 未来可选         | 业务复杂度提升后可部署于 CloudBase 云托管      |
| Prisma             | 未来可选         | 引入关系型数据库后作为 ORM 候选                |
| PostgreSQL / MySQL | 未来可选         | 复杂关系查询或事务需求明确后再评估             |
| Redis              | 不使用           | 当前无高频缓存和任务队列需求，属过度设计       |
| ECharts            | 不使用           | 基础图表用轻量自绘组件，避免包体积             |
| Nginx / VPS        | 不使用           | 当前由 CloudBase 承担托管接入和基础设施维护    |

## 2. 前端架构

### 目录规划

```text
src/
├── components/
├── composables/
├── constants/
├── pages/
├── services/
├── stores/
├── styles/
├── types/
├── utils/
└── validators/
```

### 核心模块

| 模块                      | 职责                                                     |
| ------------------------- | -------------------------------------------------------- |
| `services/cloudbase.ts`   | CloudBase 初始化、调用封装和错误转换                     |
| `services/device.ts`      | 设备业务操作契约                                         |
| `services/maintenance.ts` | 维护记录业务操作契约                                     |
| `services/stats.ts`       | 统计业务操作契约                                         |
| `stores/user.ts`          | 登录态、注销                                             |
| `stores/device.ts`        | 列表、筛选、缓存                                         |
| `utils/date.ts`           | 日期计算和保修剩余天数                                   |
| `utils/money.ts`          | 金额展示                                                 |
| `validators/device.ts`    | 设备表单校验                                             |
| `components/`             | Empty、Error、Loading、DeviceCard、DateField、MoneyField |

### UI 策略

优先使用：

- uni-app 原生基础组件
- 自建 Empty / Error / Loading / DeviceCard / 表单字段组件
- 少量必要的日期、弹层能力

不引入大型 UI 框架。原因：

- GearFlow 页面数量有限，自建可控
- 小程序包体积敏感
- 表单和状态组件更容易做类型约束

### 数据可视化策略

P0 只需要：

- 数字卡片
- 分类占比条
- 年度支出简单柱状图
- 生命周期分布列表

先用自绘组件实现，当图表交互复杂后再评估 ECharts。

## 3. CloudBase 业务架构

### 业务模块

```text
cloudfunctions/
├── auth-bootstrap/
├── users/
├── devices/
├── maintenance-records/
├── statistics/
├── privacy/
└── account-deletion/
```

目录只表达未来 Phase 1 的业务边界，本阶段不创建代码。

### 调用分层

| 场景                 | 第一阶段实现方式                       | 原因                             |
| -------------------- | -------------------------------------- | -------------------------------- |
| 系统分类读取         | JS SDK v3 `app.rdb()` 直接读取         | 只读、规则简单、数据非敏感       |
| 用户设备列表与详情   | `app.rdb()` 或云函数，按查询复杂度选择 | 必须受用户身份与 RLS 约束        |
| 设备创建、编辑、删除 | 云函数                                 | 同时影响保修、时间线和成本数据   |
| 维护记录写入         | 云函数                                 | 需要同步时间线和成本数据         |
| 统计查询             | 云函数                                 | 集中维护统计口径，避免客户端篡改 |
| 账号注销             | 云函数                                 | 需要跨表删除、云存储清理和审计   |
| P1 附件上传          | CloudBase 云存储 + 云函数元数据校验    | 文件和业务数据分离               |

### 身份与权限

第一阶段使用 CloudBase 身份认证的微信小程序静默登录（`signInWithOpenId`），不自行实现 `code2Session + JWT` 会话体系。

```text
用户打开微信小程序
→ JS SDK 调用 signInWithOpenId 建立 CloudBase 会话（用户无感）
→ SDK 会话自动携带身份，数据库 RLS 通过 auth.uid() 判定归属
→ 服务端边界创建或查询 GearFlow User 行
→ RLS 策略和云函数共同限制用户数据访问
```

规则：

- `userId` 必须由 CloudBase 可信身份上下文派生（`auth.uid()`），不能由客户端指定
- 用户只能查询和修改自己的行，归属由 RLS 策略强制，UI 隐藏不作为权限手段
- 系统分类等公共只读数据单独设置权限
- AppSecret 和管理端凭据（API Key / service_role）不得进入客户端
- 账号注销删除 GearFlow 业务数据；平台身份本身按 CloudBase 和微信官方能力处理
- 如果未来引入 CloudBase 云托管或独立 API，再单独设计服务间鉴权和会话机制

## 4. 数据同步与缓存

P0 不做完整离线同步。原因：

- 多端冲突处理复杂度高
- 小程序卸载导致本地数据不可靠
- 服务端才是数据源

允许使用轻量缓存：

- 设备列表第一页缓存
- 用户偏好缓存
- 静态分类缓存

缓存必须在编辑、删除、注销后清理。

## 5. 环境规划

| 环境        | 用途                       | CloudBase 资源           |
| ----------- | -------------------------- | ------------------------ |
| local       | uni-app 本地开发与单元测试 | 本地配置，不保存生产密钥 |
| development | 微信开发者工具、体验版联调 | CloudBase 开发/测试环境  |
| production  | 本人正式使用和少量朋友体验 | CloudBase 生产环境       |

优先使用独立的开发和生产环境，避免测试数据污染真实数据。若当前套餐或资源限制不允许，至少使用明确的集合命名、环境变量和发布检查隔离数据。

当前前端配置只需要公开信息，例如：

- `CLOUDBASE_ENV_ID`
- `APP_ENV`

管理端密钥、微信 AppSecret 和未来第三方服务密钥只允许放在 CloudBase 服务端配置中。

## 6. 错误处理规范

### 统一响应

```json
{
  "success": true,
  "data": {}
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_NOT_FOUND",
    "message": "设备不存在",
    "requestId": "..."
  }
}
```

### 前端状态

所有页面必须覆盖：

- 首次加载
- 下拉刷新
- 分页加载更多
- 空数据
- 网络错误
- 权限失效
- 表单校验错误
- 提交中
- 重复提交

## 7. 日志规范

允许记录：

- requestId
- userId
- 接口路径
- 状态码
- 耗时
- 错误码

禁止记录：

- OpenID
- 手机号
- Token
- 序列号
- 发票图片地址
- 设备照片地址
- 完整价格和型号组合

生产环境默认不输出 debug 日志。

## 8. 测试策略

### 单元测试

- 保修剩余天数和状态
- 金额转换
- 设备表单校验
- 统计计算
- 用户隔离条件

### 云函数与数据权限测试

- 登录
- 设备 CRUD
- 维护记录 CRUD
- 统计查询
- 越权访问
- 账号注销

### 手工测试

- 微信开发者工具
- iOS 真机
- Android 真机
- 弱网
- 首次启动
- 空数据
- 身份失效或权限拒绝

## 9. 小程序与 H5 差异

| 能力     | 小程序           | H5               |
| -------- | ---------------- | ---------------- |
| 登录     | `wx.login`       | 需要其他登录方案 |
| 存储     | `uni.setStorage` | localStorage     |
| 请求域名 | 必须配置合法域名 | 按浏览器策略     |
| 图片选择 | 小程序媒体 API   | 文件选择         |
| 订阅消息 | 微信订阅消息     | 不适用           |
| 条件编译 | `MP-WEIXIN`      | `H5`             |

第一阶段以微信小程序为准，不承诺 H5 功能完整。

## 10. 发布与运行方式

当前阶段：

```text
本地开发
  → 微信开发者工具
    → CloudBase 开发/测试环境
      → 本人真实使用
        → 少量朋友体验
```

要求：

- 不购买 VPS，不维护 Nginx、数据库服务器或自建 HTTPS
- 分离开发数据与生产数据
- 数据库和云存储安全规则采用最小权限
- 云函数配置、日志和错误监控可追踪
- 为 CloudBase 资源使用量设置合理监控或告警
- 定期验证数据导出、备份和账号删除流程

## 11. 成本原则

当前阶段优先使用 CloudBase 免费额度或低成本套餐，目标是在本人和少量朋友使用时将基础设施成本控制在尽可能低的水平。具体额度、计费单位和价格以腾讯云当时的官方计费页面为准，项目文档不硬编码价格。

## 12. Future Evolution

CloudBase 是当前正式架构，不是必须迁出的临时方案。未来优先在 CloudBase 体系内扩展；只有复杂业务规则、关系查询、事务、长任务或团队协作需求明确出现时，才评估增加自定义后端。

```text
当前：
uni-app
  → CloudBase

未来可选：
uni-app
  → CloudBase
    → CloudBase 云托管
      → NestJS
        → Prisma
          → PostgreSQL / MySQL
```

NestJS、Prisma 和关系型数据库属于演进选项，不进入当前 MVP，也不在 Phase 1 预先安装。
