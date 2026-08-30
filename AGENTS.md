# GearFlow 开发规范

## 项目状态

GearFlow 的 **Phase 0 立项与规划已完成**，当前等待进入 Phase 1。未经用户明确确认，不创建业务页面、不实现设备 CRUD、不安装大量依赖。

后续开发必须以以下文档为准：

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
- MySQL / PostgreSQL：不自行部署关系型数据库（CloudBase 平台托管的 PostgreSQL 服务属于 BaaS 能力，已于 2026-08-30 确认使用，见 docs/DATABASE.md 存储引擎决策）
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
2. **业务边界**：前端负责展示和输入校验；CloudBase 安全规则负责基础数据权限；云函数负责可信身份、业务校验、多集合一致性、统计和删除流程。
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
- 前端只保存 CloudBase 环境 ID 等公开配置；微信 AppSecret 和服务端密钥不得进入客户端。

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
