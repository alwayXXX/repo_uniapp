# GearFlow

个人数码设备资产管理微信小程序。设备台账、维护记录、保修状态与成本统计。

技术基线：uni-app + Vue 3 + TypeScript strict + Pinia + 腾讯云 CloudBase。

截至 2026-09-23：Phase 0-9 已验收，用户已上传体验版并邀请朋友测试正常；正式审核发布尚未确认。本轮修复及验证证据见 [收尾记录](docs/RELEASE-CLOSEOUT.md)，接手先读 [HANDOFF](docs/HANDOFF.md)。

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
pnpm test:release      # 发布检查器回归（仅合成凭据）
pnpm test:database     # 内存 PostgreSQL 迁移、权限、事务及注销回归
pnpm type-check         # TypeScript 严格类型检查
pnpm lint               # ESLint 检查
pnpm format             # Prettier 格式化
```

## 运行到微信开发者工具

1. 项目已在 `src/manifest.json` 配置绑定的小程序 AppID；若切换到其他小程序，再替换为对应 AppID。
2. 执行 `pnpm dev:mp-weixin`（或 `pnpm build:mp-weixin`）。
3. 用微信开发者工具导入 `dist/dev/mp-weixin`（或 `dist/build/mp-weixin`）目录。
4. 当前设备、维护、统计和注销写入由 CloudBase PostgreSQL RPC 提供；`cloudfunctions/wx-login/` 提供微信 code 换 CloudBase 自定义登录票据。
5. 需要上传时先运行 `pnpm build:mp-weixin:release`、`pnpm verify:phase10`；上传前另行核对 [上线清单](docs/LAUNCH.md)，本地检查通过不等于已具备全部发布证据。

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
- 密钥（AppSecret、服务端密钥等）一律不进入前端与仓库，只放在 CloudBase 服务端配置。
- 登录依赖云函数的 `WX_SECRET` 和 `TCB_CREDENTIALS_JSON`；重置后必须同步函数配置并验证原账号数据仍可访问，详见 [OPS-7](docs/OPS7-LOGIN-DESIGN.md)。
- 测试无需生产凭据或线上数据库连接。发布检查始终扫描通用凭据模式；环境未提供精确密钥值时，会明确报告附加精确扫描未执行。
- 当前发现与决策记录见 [docs/PHASE1-FINDINGS.md](docs/PHASE1-FINDINGS.md)。

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
cloudfunctions/    # wx-login 自定义登录入口
scripts/           # 发布检查、隔离数据库回归及历史 DevTools 冒烟脚本
```

# hooks verification
