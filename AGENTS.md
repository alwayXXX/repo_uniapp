# GearFlow 开发规范

## 项目状态

**Phase 0-9 已完成并通过验收**。截至 2026-10-07，原 CloudBase PG 环境因欠费注销，项目已迁移到新环境的 **CloudBase MySQL + `wx.cloud.callFunction` + 微信 OPENID** 架构；这是当前唯一运行路径，不再依赖 AppSecret、自定义登录私钥、RLS 或 PL/pgSQL RPC。旧 PG 迁移和设计文档仅作历史记录。迁移详情见 `docs/MYSQL-MIGRATION.md`。

**接手必读**：`docs/HANDOFF.md`（环境事实、踩坑经验、验收方法——大量内容不在代码里）。

**2026-10-27 用户裁定**：当前仅交付本人使用的体验版，不公开上架。Phase 10 按 `docs/EXPERIENCE-DELIVERY.md` 和 `docs/ROADMAP.md` 的自用标准收尾；正式提审、备案/类目专项核验和公开发布移至未来公开发布清单。数据隔离、协议、注销、隐私及错误处理要求继续适用。Phase 11 不自动开启。

**后续明确授权**：用户已选择「P11 按清单逐项做完」，本次进入附件、订阅提醒、设备处置、年度报告和 JSON 导出，范围及验收状态以 `docs/PHASE11.md` 为准。Phase 12 AI 仍未授权。

**2026-10-28 交付状态更正**：1.2.0 已设为体验版，附件上传/查看/删除均获本人确认。本人最新明确表示未收到微信服务通知，覆盖此前误解形成的收件确认；P11 重新打开订阅送达验收，不得将定时执行、SENT 或人工旧记录当作实际收件证据。详见 `docs/PHASE11.md`；不得自动进入 P12 或公开发布。

**2026-10-28 后续验收**：修复后的新一次定时发送取得微信成功回执，本人明确确认在服务通知中看到保修提醒；此前的旧收件确认仍已撤回。1.2.0 为自用体验版，试发后本人确认每小时触发配置上传成功；上传成功与下一自然整点实际触发是不同证据，后者尚未单独验证。不得自动进入 P12 或公开发布。

**2026-11-10 新授权**：用户要求按讨论的顺序开始制作，先完善自用备份与恢复，再逐项实现 Phase 12 设备顾问、年度解读、图片识别。以上 P12 未授权表述保留为当时历史，现以 `docs/PHASE12.md` 的范围和真实验收状态为准；公开发布仍未授权。

后续开发必须以以下文档为准：

- `docs/HANDOFF.md`：交接文档（环境、数据库、自动化、已知坑）——最先读
- `docs/PRD.md`：产品范围、MVP、用户流程和页面信息架构
- `docs/ARCHITECTURE.md`：技术选型、模块边界和工程规范
- `docs/DATABASE.md`：数据模型、索引、删除策略和隐私约束
- `docs/API.md`：接口契约、错误码和鉴权规则
- `docs/ROADMAP.md`：阶段目标、完成标准和提交边界
- `docs/LAUNCH.md`：微信小程序上线、合规与安全清单

如果实现与文档冲突，先修改文档并说明原因，再编码。

## 技术边界

### 第一阶段必须使用

- uni-app
- Vue 3 Composition API
- TypeScript strict
- Pinia
- 腾讯云 CloudBase

### 第一阶段明确不使用

- NestJS：保留为未来复杂业务层的可选技术，不属于当前 MVP
- Prisma：保留为未来关系型数据库 ORM 的可选技术，不属于当前 MVP
- MySQL / PostgreSQL：不自行部署关系型数据库；当前使用 CloudBase 平台托管的 MySQL 8.0 Serverless（见 `docs/MYSQL-MIGRATION.md`）
- Redis：当前无高频读写、任务队列或复杂缓存需求
- Nginx：当前不自行维护反向代理和 HTTPS 基础设施
- 独立服务器 / VPS：当前不购买或维护后端服务器
- ECharts：基础统计先使用轻量自绘组件，避免包体积和兼容性负担
- 复杂 UI 组件库：优先使用 uni-app 基础组件和少量必要组件
- 支付、电商、社交、社区、交易、金融、复杂会员、AI 聊天

### 未来架构演进

只有真实业务复杂度证明 CloudBase 当前能力不足时，才评估：

```text
uni-app
  → CloudBase
    → CloudBase 云托管
      → NestJS
        → Prisma
          → PostgreSQL / MySQL
```

这条路线是可选演进方向，不是预设迁移任务。

## 开发原则

1. **MVP 纪律**：只实现 `docs/PRD.md` 中的 P0 功能；P1/P2 必须先通过文档变更进入范围。
2. **业务边界**：前端负责展示和输入校验；微信 `wx.cloud.callFunction` 自动注入 OPENID；`gearflow-api` 云函数以 OPENID 过滤全部数据，并负责业务校验、跨表一致性、统计和删除流程。
3. **用户隔离**：所有用户数据必须绑定 CloudBase 可信身份上下文派生的 `userId`，禁止信任前端传入的用户 ID。
4. **隐私优先**：日志禁止输出序列号、发票、价格、照片地址、手机号、OpenID、access token。
5. **删除语义**：账号注销必须物理删除或匿名化用户数据，不能只做前端隐藏。
6. **接口契约**：先明确 API 请求/响应类型，再实现页面。
7. **测试策略**：业务逻辑、日期计算、权限判断和统计逻辑必须有单元测试；关键流程补充接口测试。
8. **提交粒度**：每个 Phase 内按可验证的小任务提交 Git commit，不允许一次性提交巨型混合变更。

## 工程规范

### TypeScript

- 开启 `strict: true`。
- 禁止使用 `any` 除非是第三方库边界，且必须写明原因。
- API 类型集中放在 `src/types/api/`，业务模型类型与 UI 组件类型分离。

### 代码风格

- 使用 ESLint 检查语法、未使用变量和明显错误。
- 使用 Prettier 统一格式。
- Vue 组件优先使用 `<script setup lang="ts">`。
- 通用 UI、日期、金额、状态、API 层必须复用，不允许在页面中复制粘贴逻辑。

### Git

项目初始化 Git 后使用以下提交格式：

```text
type(scope): summary
```

常用 type：

- `feat`：新功能
- `fix`：缺陷修复
- `docs`：文档
- `refactor`：重构
- `test`：测试
- `chore`：工程配置
- `style`：样式或格式

示例：

```text
docs(planning): complete GearFlow project blueprint
feat(device): add device creation flow
```

### 环境变量

- 仓库只提交 `.env.example`，禁止提交真实 `.env`。
- 密钥只允许通过 CloudBase 配置、部署平台或本机环境变量注入。
- 前端只保存 CloudBase 环境 ID 等公开配置；CloudBase 管理凭据和服务端密钥不得进入客户端。

## 状态与错误处理

所有列表和表单页面必须处理：

- Loading
- Empty State
- Error State
- 网络异常
- 权限失效
- 表单校验失败
- 保存中重复提交

## 微信小程序注意事项

- 每次提交审核前，必须重新核实 `docs/LAUNCH.md` 中列出的官方文档。
- 隐私接口调用必须与《用户隐私保护指引》声明一致。
- 需要用户提供序列号、发票、照片等敏感信息时，必须说明用途、保存期限和删除方式。
- 微信订阅消息、图片上传、AI 能力均不属于 MVP P0，进入实现前必须单独补充隐私与安全评估。
