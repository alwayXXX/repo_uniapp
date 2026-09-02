# GearFlow 交接文档（ZCode → Codex）

> 生成于 2026-08-31。Phase 0-5 已完成并通过验收，从 **Phase 6（设备生命周期）** 继续。
> 本文档是环境事实与踩坑经验的唯一权威来源——很多内容不在任何代码或 Phase 0 文档里。
> 阶段定义与完成标准以 `docs/ROADMAP.md` 为准；数据模型以 `docs/DATABASE.md` 为准；验收记录见 `docs/PHASE1-FINDINGS.md`。

## 1. 状态总览

| 阶段             | 状态 | 验收证据                                                                                 |
| ---------------- | ---- | ---------------------------------------------------------------------------------------- |
| Phase 0 立项     | ✅   | Phase 0 文档；存储引擎曾受控修订为 CloudBase PostgreSQL（docs/DATABASE.md 存储引擎决策） |
| Phase 1 初始化   | ✅   | docs/PHASE1-FINDINGS.md §7-8：真实链路四绿 + RLS 隔离实证                                |
| Phase 2 UI 基础  | ✅   | 用户视觉验收（Token/五态组件/四 Tab）                                                    |
| Phase 3 用户体系 | ✅   | scripts/verify-phase3.mjs 7/7 + 数据库核对                                               |
| Phase 4 设备管理 | ✅   | 用户人工全流程验收（创建/编辑/软删除，软删除证据入库）                                   |
| Phase 5 设备详情 | ✅   | scripts/verify-phase5.mjs 14/14 + 用户 14 项验收（修复返回不刷新 bug：onLoad→onShow）    |

里程碑：已达成「可体验」。剩 Phase 6 生命周期 → 7 维护保修 → 8 统计 → 9 测试 → 10 发布（→11/12 迭代）。

## 2. 环境事实

- **CloudBase 环境**：`myrepo-d1gfju7se642a63ce`（PG 模式，ap-shanghai，体验版套餐）。管理走 mcporter CLI（已账号级登录）：`npx -y mcporter call cloudbase.<tool> ...`。**IDE 直连的 CloudBase MCP 是独立未登录会话，不可用。**
- **小程序 AppID**：`wx8f26567f4d54b3f7`（在 src/manifest.json）。身份走「小程序认证 + wx.cloud 通道」，**不需要也不依赖 AppSecret**。
- **真实用户**：数据库里只有一条用户行（identity_id `2094087771344871424`，ACTIVE）+ 2 条同意记录；无其他测试数据。
- **GitHub**：`git@github.com:alwayXXX/repo_uniapp`（main，SSH 可用，直接 `git push`）。
- **微信开发者工具**：程序在 `F:\WeChat Dev\微信web开发者工具\`（cli.bat 同目录）；服务端口 29456 已开启；自动化端口 9420（启动命令见 §5）。
- **Node 24 / pnpm 11.22**：不要动全局环境。

## 3. 工程纪律（必须遵守）

- **AGENTS.md 是最高规范**：Phase 边界、TypeScript strict、禁 any、隐私约束、提交格式。
- **每个 Phase 的固定节奏**：先改文档（如涉及）→ 数据库迁移 → 服务端验证 → 前端 → 单测/冒烟脚本 → 质量门全绿 → 提交推送 → 用户验收 → ROADMAP 标记完成。
- **质量门**：`pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build:mp-weixin` 全绿才提交。已固化进 Husky：pre-commit=lint-staged+vue-tsc（约 7s），pre-push=vitest+build（约 21s）。紧急可用 `--no-verify` 但必须补查。
- **Phase 6 属于新功能**：动工前如需改数据模型，先改 docs/DATABASE.md 再写迁移（AGENTS.md：先文档后编码）。

## 4. 数据库（CloudBase PostgreSQL）

- 迁移文件：`cloudbase/migrations/`（30 个，即 schema 历史）。**新迁移一律走 `managePgDatabase action=applyMigration`**，且：
  - **一个迁移只放一条语句**（runner 按语句切，多语句会静默只执行第一条）
  - **migrationName 只允许小写字母+下划线，不能含数字**（v2 这种命名会被拒）
  - 本地文件内容必须与 --sql 参数完全一致（含无末尾换行），否则 LOCAL_MIGRATION_FILE_MISMATCH
  - 若报「Name 只允许小写字母」但名字明明合规：检查 `config/cloudbase/migrations/` 镜像目录是否有脏文件（该目录已 gitignore，可直接清理）
- **RLS 是唯一权限边界**：所有用户表 `user_id ≡ auth.uid()`（varchar 身份串，不是 users.id 的 UUID——Phase 3 踩过这个 bug）。写策略时 USING + WITH CHECK 都要。迁移 runner 会自动给 authenticated 授全套权限，**每次建表后必须 REVOKE 收敛到最小**（TRUNCATE 不受 RLS 约束，必收）。
- **身份函数**：`gf_bootstrap_user(privacy, terms)` / `gf_delete_account()`（SECURITY DEFINER RPC，执行权限仅 authenticated）。Phase 6+ 的时间线写入如需服务端边界，按同样模式加函数。
- **服务端验证方法**（不依赖小程序）：`managePgDatabase action=execute --role authenticated` + `WITH s AS (SELECT set_config('request.jwt.claim.sub','<uid>',true)) SELECT ... FROM s`（LATERAL 保证 set_config 先执行；GUC 不跨调用持久，每次都要带）。

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

- 技术栈：uni-app 3.0.0-5020420260813003 + Vue 3.5 + TS 5.9 strict + Pinia 2.3 + @cloudbase/js-sdk 3.9（数据层 `app.rdb()` postgREST 风格 + `rdb.rpc()`——运行时支持但类型未声明，已用 `callRpc()` 封装窄化）。
- **js-sdk 的 insert 必须链 `.select()` 才返回新行**；`.update().eq()` / `.delete().eq()` 返回空 data 是正常行为。
- 状态层：`stores/device.ts` 的 `loadFirst` 已做 `ensureSession()` 会话自愈（令牌 2 小时过期问题）。**新写的数据入口都要前置 ensureSession**。
- 主题 Token：`src/styles/variables.scss`（scss）+ `src/styles/tokens.ts`（TS）双轨，改色必须两处同步；uni.scss 用 `@import "@/styles/..."` 别名（相对路径会被注入到各组件目录解析而报错）。
- vitest 已配（`pnpm test`）；小程序端与 Node 端共用 `@/` 别名。
- 详情页数据加载用 `onShow`（返回栈恢复也要刷新），这是 Phase 5 用户抓过的 bug，新页面照此模式。

## 7. 待办备忘（非阻塞）

- **Phase 10 提审前**：小程序后台重置一次 AppSecret（旧值曾在误配 provider 时暴露过，当前零依赖）。
- Phase 5 里「保修/维护/时间线」三个占位区块等 Phase 6/7 填充。
- DevTools 多账号调试 A/B 互测（可选加强项，从未做过）。
- `gf_diag_view` 诊断视图仍在库里（只读无害），Phase 9 清理时评估删除。

## 8. 改进清单与 Phase 8 特别指令

验收与代码审查发现的体验/工程升级点统一记录在 docs/BACKLOG.md（20 项，五大类）。处理新 Phase 前先浏览一遍，合适的时点顺手消化。

**Phase 8（数据统计）开工前必须处理**：

1. **ENG-2 统计口径二义性**——总资产来源二选一（A: 直读 devices.purchase_price_cents；B: 维护 device_costs 的 PURCHASE 行）。裁定后先改 docs/DATABASE.md 9.7 再编码。用户未明确裁定前，不要自行决定。
2. **ENG-1 / ENG-5 列表上限**——统计与看板改为 RPC 聚合（count/sum），勿再单页拉全量。
3. **UX-2 金额显示**——统计页做千分位与 currency 符号跟随。

UX 类条目（含 UX-1 表单校验框架升级）按 BACKLOG 建议时点执行，用户未拍板前不提前引入新依赖。

## 9. Phase 6 入场提示（ROADMAP 原文为准）

目标：设备变更自动生成时间线。涉及：`device_timelines` 集合（DATABASE.md 4.7，PG 化为表 `device_timelines`）、设备写路径自动追加事件、详情页时间线区块接真数据。事件类型 CREATED/UPDATED/MAINTENANCE/WARRANTY/DISPOSED；时间线不落敏感字段原文。按 §3 节奏执行，完成后更新 ROADMAP 标记并请用户验收。
