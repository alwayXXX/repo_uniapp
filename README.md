# GearFlow

个人数码设备资产管理微信小程序。设备台账、维护记录、保修状态与成本统计。

技术基线：uni-app + Vue 3 + TypeScript strict + Pinia + 腾讯云 CloudBase。

当前为自用微信体验版，运行链路为 CloudBase MySQL + 微信 OPENID。Phase 0–11 按自用范围完成，1.2.2 体验版已交付；备份、设备恢复和测试图片恢复已在 iPhone 验证。运行配置见 [MySQL 配置](docs/MYSQL-MIGRATION.md)，接手先读 [HANDOFF](docs/HANDOFF.md)。

P11 的附件与一次保修提醒已获本人真机确认；每小时配置上传成功后的自然整点执行尚未单独验证，见 [P11 记录](docs/PHASE11.md)。P12 AI 仍在开发，云端部署和真机验收未完成，见 [P12 记录](docs/PHASE12.md)。

规划文档见 [docs/](docs/)，工程规范见 [AGENTS.md](AGENTS.md)。

## 环境要求

- Node.js 24（与本机及 CI 已验证环境一致）
- pnpm 11（本机已验证 11.22）
- 微信开发者工具（运行与调试小程序）

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm dev:mp-weixin      # 开发模式编译微信小程序（产物 dist/dev/mp-weixin）
pnpm build:mp-weixin    # 普通构建；不作为正式提审产物
pnpm build:mp-weixin:release # 正式构建，启用合法域名校验
pnpm verify:phase10     # 构建结构、开发路由与通用凭据扫描
pnpm test              # 单元与页面回归
pnpm test:api          # 当前 MySQL 云函数隔离与注销回归（本地合成数据）
pnpm test:release      # 发布检查器回归（仅合成凭据）
pnpm test:database     # PGlite 中验证授权记录的外键冻结行为，不连接线上数据库
pnpm type-check         # TypeScript 严格类型检查
pnpm lint               # ESLint 检查
pnpm format             # Prettier 格式化
```

## 运行到微信开发者工具

1. 项目已在 `src/manifest.json` 配置绑定的小程序 AppID；若切换到其他小程序，再替换为对应 AppID。
2. 执行 `pnpm dev:mp-weixin`（或 `pnpm build:mp-weixin`）。
3. 用微信开发者工具导入 `dist/dev/mp-weixin`（或 `dist/build/mp-weixin`）目录。
4. 当前业务统一通过 `cloudfunctions/gearflow-api/` 访问 CloudBase MySQL；客户端只调用云函数，OPENID 由运行环境自动注入。
5. 自用体验版上传前运行 `pnpm build:mp-weixin:release`、`pnpm verify:phase10`，按 [体验版交付记录](docs/EXPERIENCE-DELIVERY.md) 留存结果；[上线清单](docs/LAUNCH.md) 用于未来公开发布。本地检查、平台上传和手机验收分别记录。

## Git 钩子（Husky）

- **pre-commit**（约 7 秒）：暂存文件 ESLint 修复 + Prettier 格式化（lint-staged），随后全量 vue-tsc 类型检查——类型错误无法进入提交历史
- **pre-push**（约 20 秒）：vitest 单元测试 + 微信小程序构建——远程仓库始终保持测试通过、可构建的状态
- 钩子失败即中止对应操作；紧急情况可用 git commit --no-verify 绕过（需在后续提交补上检查）

## Git 提交规范

- 提交信息使用 `type(scope): summary` 格式，见 [AGENTS.md](AGENTS.md)。
- 已配置 Husky：pre-commit 对暂存文件自动执行 ESLint 修复与 Prettier 格式化（lint-staged）。
- pre-commit 随后执行全量 `pnpm type-check`；pre-push 执行 `pnpm test` 与 `pnpm build:mp-weixin`。

## CloudBase 配置

- 复制 `.env.example` 为 `.env`，填入 `CLOUDBASE_ENV_ID`（公开配置，可安全放在客户端）。
- 服务端密钥一律不进入前端与仓库；当前用户身份使用微信原生 OPENID，不再需要 AppSecret 或自定义登录私钥。
- 测试无需生产凭据或线上数据库连接。发布检查始终扫描通用凭据模式；环境未提供精确密钥值时，会明确报告附加精确扫描未执行。
- 当前状态和操作约束见 [docs/HANDOFF.md](docs/HANDOFF.md)。

## 目录结构

```text
src/
├── components/    # 通用 UI 组件
├── composables/   # 组合式函数
├── constants/     # 常量（错误文案等）
├── pages/         # 页面
├── services/      # CloudBase 调用封装与业务服务
├── stores/        # Pinia 状态
├── styles/        # 样式与主题 Token
├── types/         # API 与业务类型（API 契约类型在 types/api/）
├── utils/         # 工具（错误转换等）
└── validators/    # 表单校验
cloudfunctions/    # gearflow-api 业务入口及进行中的 P12 AI、维护代码
scripts/           # 发布检查、云函数与隔离数据库回归
```
