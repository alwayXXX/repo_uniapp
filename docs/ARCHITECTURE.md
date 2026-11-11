# GearFlow 技术架构文档

> **当前范围**：自用备份与恢复已交付；Phase 12 AI 已进入体验版，具体验证状态和待处理事项见 `docs/PHASE12.md`。保留现有 MySQL、可信 OPENID 与云函数边界。

> **当前架构**：小程序使用 wx.cloud.callFunction 调用 gearflow-api，服务端依据可信微信身份访问 CloudBase MySQL。

## 1. 总体结论

GearFlow 第一阶段采用 CloudBase BaaS 架构，将基础设施维护交给托管云能力，同时保留清晰的业务边界：

```text
微信小程序
  └─ uni-app
      └─ Vue 3 + TypeScript + Pinia
          └─ CloudBase
              ├─ CloudBase MySQL（业务数据）
              ├─ gearflow-api 云函数（OPENID + 业务逻辑）
              ├─ 云存储（P1 附件）
              ├─ 微信原生 OPENID 身份
              └─ 日志、监控及其他按需云能力
```

当前使用规模是本人和少量朋友。第一阶段不购买独立服务器，不自行部署关系型数据库、Nginx 或 HTTPS 基础设施，将开发精力集中在产品和数据安全上。

> **当前存储引擎（2026-10-07）**：`myrepo-d7go4fyg918beac63`，CloudBase MySQL 8.0 Serverless。客户端不直连数据库，所有业务调用先进入 `gearflow-api`，服务端以 OPENID 过滤数据。

### 必要性判断

| 技术                    | 第一阶段是否使用 | 原因                                                       |
| ----------------------- | ---------------- | ---------------------------------------------------------- |
| uni-app                 | 使用             | 指定小程序第一发布平台                                     |
| Vue 3                   | 使用             | Composition API 适合复杂表单和状态复用                     |
| TypeScript strict       | 使用             | 降低接口和业务模型错误率                                   |
| Pinia                   | 使用             | 管理用户、设备列表、筛选和统计状态                         |
| CloudBase               | 使用             | 承担身份、数据、云函数、云存储和托管运维能力               |
| CloudBase 数据库        | 使用             | 保存账号、设备、维护、时间线和统计相关数据                 |
| CloudBase MySQL         | 使用             | 当前托管关系数据库，保存用户、设备、保修、维护与统计明细   |
| CloudBase 云函数        | 使用             | `gearflow-api` 读取 OPENID，承担校验、跨表写入、统计和注销 |
| CloudBase 云存储        | P1               | 保存设备照片、发票和维修凭证，不在 MVP 启用                |
| NestJS                  | 未来可选         | 业务复杂度提升后可部署于 CloudBase 云托管                  |
| Prisma                  | 未来可选         | 引入关系型数据库后作为 ORM 候选                            |
| 自管 PostgreSQL / MySQL | 未来可选         | 当前使用 CloudBase 托管 MySQL，不自建数据库服务器          |
| Redis                   | 不使用           | 当前无高频缓存和任务队列需求，属过度设计                   |
| ECharts                 | 不使用           | 基础图表用轻量自绘组件，避免包体积                         |
| Nginx / VPS             | 不使用           | 当前由 CloudBase 承担托管接入和基础设施维护                |

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

| 模块                       | 职责                                                     |
| -------------------------- | -------------------------------------------------------- |
| `services/cloudbase.ts`    | CloudBase 初始化、调用封装和错误转换                     |
| `services/consent.ts`      | 当前协议版本与引导守卫；不承担服务端鉴权                 |
| `services/client-state.ts` | 退出/注销使在途请求与导出失效                            |
| `services/export.ts`       | 既有 CSV 导出、分享及临时文件清理                        |
| `services/device.ts`       | 设备业务操作契约                                         |
| `services/maintenance.ts`  | 维护记录业务操作契约                                     |
| `services/stats.ts`        | 统计业务操作契约                                         |
| `stores/user.ts`           | 登录态、注销                                             |
| `stores/device.ts`         | 列表、筛选、缓存                                         |
| `utils/date.ts`            | 日期计算和保修剩余天数                                   |
| `utils/money.ts`           | 金额展示                                                 |
| `validators/device.ts`     | 设备表单校验                                             |
| `components/`              | Empty、Error、Loading、DeviceCard、DateField、MoneyField |

### UI 策略

根据用户要求，前端统一迁移到 Wot UI V2（`@wot-ui/ui`）和 UnoCSS。Wot 负责常用交互组件与主题，UnoCSS 负责页面布局和通用样式；设备管理所需的业务校验、隐私提示和加载、空、错误状态仍由应用负责。保留 GearFlow 蓝白主题及小程序原生导航，需微信授权的文件选择、订阅等操作继续使用原生接口。

界面以日常设备管理为中心：手机单列、蓝色用于主要操作、浅灰底搭配白色内容区，按信息相关性组织卡片和表单。首页、设备列表、表单及数据页沿用同一组圆角、间距和文字色；页面细节通过本地小程序模拟器核对。

此选择替代早期“不引入大型 UI 框架”的方案，原因是用户要求统一全项目的界面技术栈。按需编译组件，逐页核对交互、包体积及微信开发者工具表现；小程序旧体验版、云函数及数据不因本地界面改造自动更新。

### 数据可视化策略

当前统计页使用 Wot UI 的进度条表现分类、生命周期和逐月支出，数值继续由现有统计逻辑计算；不新增图表服务器，也不为简单进度展示引入重型图表库。通用状态、设备列表和引导页使用 Wot UI 图标，字体随构建产物提供，避免依赖额外图标域名。页面特有布局继续保留必要的 SCSS，通用颜色与样式逐步使用 UnoCSS 和主题变量。

统计范围包括：

- 数字卡片
- 分类占比条
- 年度支出简单柱状图
- 生命周期分布列表

先用自绘组件实现，当图表交互复杂后再评估 ECharts。

## 3. CloudBase 业务架构

### 业务模块

```text
cloudfunctions/
├── gearflow-api/
├── gearflow-ai/             # P12 AI 云函数，已部署到独立 AI 环境
└── gearflow-maintenance/    # P12 维护入口草案，尚未部署
```

当前云函数 `gearflow-api` 是唯一已部署的业务数据入口；客户端不再持有数据库查询链或自定义登录票据。附件和订阅提醒已按 P11 自用范围交付，P12 状态见 `docs/PHASE12.md`。

### 调用分层

| 场景                 | 第一阶段实现方式                      | 原因                                       |
| -------------------- | ------------------------------------- | ------------------------------------------ |
| 系统分类读取         | `gearflow-api.category.list`          | 只读系统数据                               |
| 用户设备列表与详情   | `gearflow-api.device.*`               | 云函数按 OPENID 过滤，客户端不传归属       |
| 设备创建、编辑、删除 | `gearflow-api.device.save/softDelete` | 云函数校验归属，并同步保修与时间线         |
| 维护记录写入         | `gearflow-api.maintenance.*`          | 云函数同步维护、成本和时间线，并做失败补偿 |
| 统计查询             | `gearflow-api.stats/dashboard`        | 服务端按 OPENID 聚合，避免客户端伪造归属   |
| 账号注销             | gearflow-api 云函数                   | 需要跨表删除、匿名化和审计                 |
| P1 附件上传          | CloudBase 云存储 + 云函数元数据校验   | 文件和业务数据分离                         |

### 身份与权限

当前使用微信小程序原生 CloudBase 身份：`wx.cloud.callFunction` 自动附带可信 OPENID，云函数通过 `cloud.getWXContext()` 读取。不再调用 `uni.login` 或维护自定义票据。

```text
用户打开微信小程序
→ 确认当前用户协议与隐私政策
→ wx.cloud.callFunction('gearflow-api')
→ 微信运行环境注入 OPENID，云函数读取 cloud.getWXContext()
→ 云函数创建或查询 GearFlow User 行
→ 后续所有读写都以 OPENID 作为唯一归属条件
```

规则：

- OPENID 只能由云函数运行环境注入，客户端不能传入或覆盖
- 用户只能查询自己的行；所有查询和写入都必须在云函数内附加 OPENID 条件
- 系统分类等公共只读数据单独设置权限
- CloudBase 管理凭据不得进入客户端；当前运行链路不再需要微信 AppSecret
- 账号注销删除 GearFlow 业务数据；平台身份本身按 CloudBase 和微信官方能力处理
- 如果未来引入 CloudBase 云托管或独立 API，再单独设计服务间鉴权和会话机制
- 正常恢复只读取已有用户，不记录新的协议同意；只有 `acceptPolicies()` 在显式确认后调用 `auth.bootstrap`。

Phase 6 设备时间线遵循以下边界：

- `device_timelines` 仅由 `gearflow-api` 读写，小程序客户端不直连 MySQL
- `devices` 的创建、有效字段更新和软删除由云函数同步追加 `CREATED / UPDATED / DISPOSED`
- 设备状态转为 `SOLD / DISCARDED` 时生成可见的 `DISPOSED`；软删除也会生成审计事件，但删除后整条时间线对客户端不可见
- 事件只保存变更字段名等非敏感摘要，不复制序列号、价格、备注或其他字段原值
- 时间线查询同时校验设备仍未软删除；删除后历史行保留，但客户端不可见

## 4. 数据同步与缓存

P0 不做完整离线同步。原因：

- 多端冲突处理复杂度高
- 小程序卸载导致本地数据不可靠
- 服务端才是数据源

允许使用轻量缓存：

- 设备列表第一页缓存
- 用户偏好缓存
- 静态分类缓存

编辑/删除后刷新相关缓存；退出/注销清空用户与设备 Store、筛选、本机协议版本，并使在途请求失效。协议升级时必须重新明确确认。

既有 CSV 导出存入微信本机专用临时目录，分享成功、取消或失败后删除；退出、注销及再次登录前清理遗留文件。清理失败必须提示。已由用户分享至聊天或其他应用的副本不受本应用控制，CSV 也不是完整数据库备份。

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

CloudBase 管理凭据和未来第三方服务密钥只允许放在服务端或平台配置中。

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
- 接口路径
- 状态码
- 耗时
- 错误码

禁止记录：

- CloudBase UID 等可关联身份标识
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

`pnpm test:database` 在内存 PGlite 中验证 P12 外键冻结行为；它不连接线上，也不能代替 MySQL、CloudBase SDK 或真实网关的验收。当前 MySQL 云函数身份隔离和业务流程由 `pnpm test:api` 的模拟 SDK 测试覆盖。

CI 执行 lint、类型、单元/页面、发布检查器和隔离数据库测试，随后生成正式构建并扫描产物。通用凭据模式扫描始终运行；未配置真实密钥时必须明确报告附加精确值扫描未执行，不要求把生产密钥注入 CI。

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

2026-10-27 用户裁定当前仅交付本人使用的体验版，不公开上架。Phase 10 按 `docs/EXPERIENCE-DELIVERY.md` 完成自用交付；下列监控、备份和环境隔离要求保留为运维方向，当前不采购资源或配置生产级运维。未来公开发布按 `docs/LAUNCH.md` 另行核验。

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

NestJS、Prisma 和自管数据库服务器属于演进选项，不进入当前 MVP。PGlite 仅用于隔离回归。
