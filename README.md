# GearFlow

个人数码设备资产管理微信小程序。设备台账、维护记录、保修状态与成本统计。

技术基线：uni-app + Vue 3 + TypeScript strict + Pinia + 腾讯云 CloudBase。

规划文档见 [docs/](docs/)，工程规范见 [AGENTS.md](AGENTS.md)。

## 环境要求

- Node.js ≥ 20（推荐使用项目已验证的版本）
- pnpm（项目使用 pnpm 作为包管理器）
- 微信开发者工具（运行与调试小程序）

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm dev:mp-weixin      # 开发模式编译微信小程序（产物 dist/dev/mp-weixin）
pnpm build:mp-weixin    # 生产构建微信小程序（产物 dist/build/mp-weixin）
pnpm type-check         # TypeScript 严格类型检查
pnpm lint               # ESLint 检查
pnpm format             # Prettier 格式化
```

## 运行到微信开发者工具

1. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入你的小程序 AppID（当前为占位值 `touristappid`）。
2. 执行 `pnpm dev:mp-weixin`（或 `pnpm build:mp-weixin`）。
3. 用微信开发者工具导入 `dist/dev/mp-weixin`（或 `dist/build/mp-weixin`）目录。
4. 云函数目录已通过构建插件同步到产物内（`cloudfunctions/`），可直接在开发者工具中上传部署。

## Git 提交规范

- 提交信息使用 `type(scope): summary` 格式，见 [AGENTS.md](AGENTS.md)。
- 已配置 Husky：pre-commit 对暂存文件自动执行 ESLint 修复与 Prettier 格式化（lint-staged）。
- 全量类型检查不在钩子中执行，提交前请手动运行 `pnpm type-check`。

## CloudBase 配置

- 复制 `.env.example` 为 `.env`，填入 `CLOUDBASE_ENV_ID`（公开配置，可安全放在客户端）。
- 密钥（AppSecret、服务端密钥等）一律不进入前端与仓库，只放在 CloudBase 服务端配置。
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
cloudfunctions/    # CloudBase 云函数
```

# hooks verification
