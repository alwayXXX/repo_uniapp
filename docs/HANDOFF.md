# GearFlow 交接文档（ZCode → Codex）

> 更新于 2026-10-07。Phase 0-9 已完成并通过验收。原 CloudBase PG 环境因欠费注销，项目已迁移到 `myrepo-d7go4fyg918beac63` 的 **CloudBase MySQL + 微信 OPENID + 单一业务云函数** 架构；旧 PG/RLS/RPC 文档仅作历史记录。迁移详情见 `docs/MYSQL-MIGRATION.md`。
> 本文档是环境事实与踩坑经验的唯一权威来源——很多内容不在任何代码或 Phase 0 文档里。
> 阶段定义与完成标准以 `docs/ROADMAP.md` 为准；数据模型以 `docs/DATABASE.md` 为准；验收记录见 `docs/PHASE1-FINDINGS.md`。

## 1. 状态总览

| 阶段             | 状态     | 验收证据                                                                            |
| ---------------- | -------- | ----------------------------------------------------------------------------------- |
| Phase 0 立项     | ✅       | Phase 0 文档；存储引擎受控修订为 CloudBase PostgreSQL（docs/DATABASE.md）           |
| Phase 1 初始化   | ✅       | docs/PHASE1-FINDINGS.md §7-8：真实链路与 RLS 隔离实证                               |
| Phase 2 UI 基础  | ✅       | 用户视觉验收（Token/五态组件/四 Tab）                                               |
| Phase 3 用户体系 | ✅       | scripts/verify-phase3.mjs 7/7 + 数据库核对                                          |
| Phase 4 设备管理 | ✅       | 用户人工全流程验收（创建/编辑/软删除）                                              |
| Phase 5 设备详情 | ✅       | scripts/verify-phase5.mjs 14/14 + 用户人工验收                                      |
| Phase 6 生命周期 | ✅       | 设备触发器、时间线读取、RLS 隔离与用户验收                                          |
| Phase 7 维护保修 | ✅       | 维护 CRUD、保修状态、成本联动与用户验收                                             |
| Phase 8 数据统计 | ✅       | A 口径、统计/看板 RPC、权限回归与用户验收                                           |
| Phase 9 测试质量 | 完成     | 单测、CI、冒烟脚本；本轮补页面、发布检查与隔离数据库回归                            |
| Phase 10 发布    | 部分完成 | 2026-09-23 用户确认体验版分发及朋友实测正常；弱网、生产、合规和正式发布证据仍待补充 |

里程碑：已达成「可测试」并完成体验版分发；「可提审」仍需按 `docs/LAUNCH.md` 补齐证据。CSV 导出已于 2026-09-06 独立落地，仅维护该既有功能，不代表开放全部 Phase 11。

## 2. 环境事实

- **CloudBase 环境**：`myrepo-d7go4fyg918beac63`（ap-shanghai，体验版套餐，MySQL 8.0 Serverless）。管理走 CloudBase CLI：`npx --package @cloudbase/cli tcb ...`。mcporter daemon 当前可能损坏，不要把它作为唯一入口。
- **小程序 AppID**：`wx8f26567f4d54b3f7`（在 src/manifest.json）。当前使用 `wx.cloud.callFunction('gearflow-api')`，微信运行时自动注入 OPENID；不再使用 AppSecret、自定义登录私钥或 `wx-login`。
- **数据状态**：新 MySQL 从空库初始化，旧 PG 数据未迁移。不得为验证而清理真实体验账号；身份标识不写入交接文档。
- **GitHub**：`git@github.com:alwayXXX/repo_uniapp`（main，SSH 可用，直接 `git push`）。
- **微信开发者工具**：程序在 `F:\WeChat Dev\微信web开发者工具\`（cli.bat 同目录）；服务端口 29456 已开启；自动化端口 9420（启动命令见 §5）。
- **Node 24 / pnpm 11.22**：不要动全局环境。

## 3. 工程纪律（必须遵守）

- **AGENTS.md 是最高规范**：Phase 边界、TypeScript strict、禁 any、隐私约束、提交格式。
- **每个 Phase 的固定节奏**：先改文档（如涉及）→ 数据库迁移 → 服务端验证 → 前端 → 单测/冒烟脚本 → 质量门全绿 → 提交推送 → 用户验收 → ROADMAP 标记完成。
- **质量门**：`pnpm lint` / `pnpm type-check` / `pnpm test`；发布还要 `pnpm test:release` / `pnpm test:database` / `pnpm build:mp-weixin:release` / `pnpm verify:phase10`。CI 已配置完整检查；Husky 仍为 pre-commit=lint-staged+vue-tsc、pre-push=vitest+普通构建，不能代替发布门。
- **新 Phase 必须明确授权**；模型或业务契约变化仍先改文档，再编码。本轮不新增线上迁移、不部署、不重置密钥。

## 4. 数据库（CloudBase MySQL）

- 当前 schema：`database/mysql/schema.sql`；分类种子：`database/mysql/seed.sql`。
- 业务表：`users`、`device_categories`、`devices`、`warranties`、`maintenance_records`、`device_costs`、`device_timelines`、`consent_records`。
- 客户端不直接访问数据库。`gearflow-api` 从 `cloud.getWXContext().OPENID` 取得可信身份，所有读写都按 `openid` 过滤。
- `cloudbase/migrations/` 是已退役的 PostgreSQL 迁移历史，不再对当前环境执行；`pnpm test:database` 只验证历史迁移回归。
- MySQL 管理命令：`npx --package @cloudbase/cli tcb db execute -e myrepo-d7go4fyg918beac63 --sql "..." --read-only --json`。
- 写入前先在本地 schema 文件更新，再逐条执行 SQL；不要依赖多语句一次提交。

## 5. 微信开发者工具自动化（验收用）

```bash
# 启动自动化会话（DevTools 已登录、服务端口已开）
cd "/f/WeChat Dev/微信web开发者工具" && ./cli.bat auto --project "F:\\repo\\repo_uniapp\\dist\\build\\mp-weixin" --auto-port 9420
# 脚本侧连接（不要用 automator.launch，Windows 下拉不起 cli.bat）
automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
```

- **class 选择器和 DOM tap 对 uni-app 编译产物不可靠**（类名带 scoped 哈希 + 自定义组件边界）。用「标签+文本」定位（`page.$$('text')` 遍历 text()）+ 导航 API（`reLaunch/navigateTo/switchTab`）。
- button 是独立标签，文本断言按 `button` 查，不在 `text` 里。
- 生产构建下页面 `$vm.$.setupState` 驱动受限——业务动作自动化的深度就到这里，完整交互（原生弹窗、复杂 tap）交用户人工验收。
- **编译缓存陈旧**是高频坑：构建后页面行为像旧代码（报奇怪错误如 `ensureSession is not a function`）。修法：往 dist 对应文件追加一行注释触发热重载（`printf '\n// cache-bust %s\n' "$(date +%s)" >> dist/build/mp-weixin/<file>`），或 quit 后重启 cli auto。
- 现成参考脚本：`scripts/verify-phase3.mjs`、`verify-phase4.mjs`、`verify-phase5.mjs`（数据库预插数据在 bash 侧用 mcporter 做，不要在脚本里 execSync 拼 SQL——Windows cmd 引号会碎）。

## 6. 前端架构事实

- 技术栈：uni-app + Vue 3 + TS strict + Pinia；客户端数据层只保留 `wx.cloud.callFunction`。
- 状态层：`ensureSession()` 现在只检查协议确认和 `wx.cloud` 初始化，不再维护 2 小时 token。
- 主题 Token：`src/styles/variables.scss`（scss）+ `src/styles/tokens.ts`（TS）双轨，改色必须两处同步；uni.scss 用 `@import "@/styles/..."` 别名（相对路径会被注入到各组件目录解析而报错）。
- vitest 已配（`pnpm test`）；小程序端与 Node 端共用 `@/` 别名。
- 详情页数据加载用 `onShow`（返回栈恢复也要刷新），这是 Phase 5 用户抓过的 bug，新页面照此模式。
- 协议版本由 `services/consent.ts` 管理；只有引导页显式确认调用 `acceptPolicies()`。普通 `bootstrap()` 只恢复用户，旧 `gf_onboarded` 不代表同意新版。
- 退出/注销会清理用户与设备 Store、筛选和本机导出文件，并使旧请求失效。SDK `signOut()` 返回值中的 `error` 也必须检查；CSV 使用专用目录，分享结束后删除，再次登录前重试残留清理。同步文件异常兼容 `message` / `errMsg`，文件已不存在视为完成；一个文件失败仍继续清理其余导出。
- 维护详情每批最多查询 50 条，完整读取后每次展示 20 条；合计和导出不再截断，刷新立即停用旧结果并拒绝乱序回填。编辑按记录 ID 查询；保修加载或响应格式失败不能保存，详情页也显示重试而非“未填写”。

## 7. 待办备忘（非阻塞）

- **当前体验版**：使用 `gearflow-api` 和 MySQL；AppSecret/自定义登录私钥已经成为历史，不再配置或轮换。
- 提审前必须使用独立测试账号完成 A/B 数据隔离、注销后线上残留、断网恢复及冷启动验证；本地测试不能替代真实账号验证。
- 诊断函数与视图已在 2026-09-03 安全迁移中删除；正式构建不再注册开发页。

## 8. 改进清单与 Phase 8 特别指令

验收与代码审查发现的体验/工程升级点统一记录在 docs/BACKLOG.md。处理新 Phase 前先浏览；已关闭项保留历史，不擅自扩展未授权功能。

**Phase 8（数据统计）已于 2026-09-02 完成（A 口径已裁定并实现）。以下指令保留作为历史背景。** 原指令：

1. **ENG-2 统计口径二义性**——总资产来源二选一（A: 直读 devices.purchase_price_cents；B: 维护 device_costs 的 PURCHASE 行）。裁定后先改 docs/DATABASE.md 9.7 再编码。用户未明确裁定前，不要自行决定。
2. **ENG-1 / ENG-5 列表上限**——统计与看板改为 RPC 聚合（count/sum），勿再单页拉全量。
3. **UX-2 金额显示**——统计页做千分位与 currency 符号跟随。

UX 类条目（含 UX-1 表单校验框架升级）按 BACKLOG 建议时点执行，用户未拍板前不提前引入新依赖。

## 9. 当前接手边界

- 当前接手边界是维护 CloudBase MySQL 架构和体验版；不要重新引入旧 AppSecret 登录，也不要对当前环境执行 PG 迁移。
- Phase 10 正式发布证据仍需真实账号、平台配置和合规核对；本地验证不能替代。
- `cloudbase/migrations/` 与外层历史文档保留供审计，不代表当前线上 schema。
