# Phase 1 技术初始化：验证记录与待决策事项

> 状态：工程初始化完成；CloudBase 数据层验证**因环境能力与 Phase 0 文档冲突而暂停**，等待决策。
> 本文档只记录事实与选项，不修改 Phase 0 规划文档。

日期：2026-08-30

## 1. 已完成并验证

| 项目                                                | 结果                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| uni-app（Vue 3 + TypeScript strict + Vite + Pinia） | `pnpm build:mp-weixin` 构建成功，产物 `dist/build/mp-weixin`                                 |
| ESLint / Prettier / vue-tsc                         | 全部通过，0 错误                                                                             |
| Git                                                 | 已初始化，按工程/CloudBase 分 commit 提交                                                    |
| CloudBase 登录                                      | MCP 设备码授权成功（账号级）                                                                 |
| CloudBase 环境                                      | `myrepo-d1gfju7se642a63ce`（别名 myrepo，体验版，ap-shanghai，状态 NORMAL）                  |
| 云函数 auth-bootstrap                               | 已部署并调用成功，无微信上下文时按 API.md 契约返回 `UNAUTHORIZED`                            |
| 前端服务层                                          | `services/cloudbase.ts`（初始化/云函数/数据库封装/错误转换）、`stores/user.ts`、验证页面就绪 |

## 2. 冲突：环境无文档型数据库

Phase 0 文档（`docs/DATABASE.md`、`docs/ARCHITECTURE.md`）以 **CloudBase 文档型数据库**（collection 模型）为前提。

但当前账号唯一环境 `myrepo-d1gfju7se642a63ce` 实际能力：

```text
RuntimeMode: postgresql
RuntimeBackends: { postgresql: true, nosql: false, mysql: false }
```

该环境**没有文档型数据库实例**，预置了 PostgreSQL 实例（pgdb-blp5vswj）。
创建集合（`CreateTable` 等文档数据库操作）直接报错：

> This environment has no document database instance. It is provisioned with PostgreSQL instance [pgdb-blp5vswj].

影响范围：集合创建、安全规则（`doc._openid == auth.openid`）、客户端 `wx.cloud.database()` 读写、
以及 `auth-bootstrap` 中创建 User 文档的完整流程——全部暂停，未做任何猜测性迁移。

## 3. 可选路线

### 路线 A：微信开发者工具内开通「云开发」环境（保持 Phase 0 文档不变）

- 用真实小程序 AppID 在微信开发者工具 → 云开发 中开通环境（文档型数据库，AppID 绑定）。
- `wx.cloud` 天然免登录，`getWXContext().OPENID` 可用；集合与安全规则在开发者工具控制台创建。
- 代价：该环境不受腾讯云 MCP 管理，函数部署改在开发者工具内完成（本项目已把 cloudfunctions 同步到构建产物，可直接上传）。
- 对 Phase 0 文档：**零修改**。推荐理由：与现有文档完全一致，小程序是唯一客户端。

### 路线 B：迁移到 CloudBase PostgreSQL + RLS（跟随平台新默认）

- 使用当前环境 `app.rdb()`（JS SDK v3）或云函数连接 PG，权限用 RLS 策略实现用户隔离。
- 代价：需重写 `docs/DATABASE.md`（集合→表、安全规则→RLS）与 `docs/ARCHITECTURE.md` 的数据访问分层，
  且小程序端直连方式改变（不再使用 `wx.cloud.database()` 的文档模型）。属于较大文档与代码变更。
- 说明：2026 年新开 CloudBase 环境默认预置 PG，官方已将 PG 作为推荐后端方向。

### 路线 C：混合（wx.cloud 身份 + 云函数内访问 PG）

- 保留 `wx.cloud` 免登录身份与云函数分层，云函数内通过内网连接 PG 实例读写。
- 代价：仍需重写 DATABASE.md 的存储设计；客户端直读集合的架构条目需要调整。

## 4. 其他待用户完成事项

1. **小程序 AppID**：`src/manifest.json` 中 `mp-weixin.appid` 当前为占位 `touristappid`，需填入真实 AppID。
2. **微信开发者工具**：本机未安装，需安装后导入 `dist/dev/mp-weixin` 或 `dist/build/mp-weixin` 运行。
3. **用户 A/B 隔离验证**：依赖上面数据库路线确定 + DevTools 运行后，用「多账号调试」分别运行验证页面完成。
4. 环境 `myrepo-d1gfju7se642a63ce` 别名为 `myrepo`，如需可在控制台改名为 gearflow-dev。

## 5. 与 Phase 1 指令的一致性

- 指令要求「如果 CloudBase 某项能力与当前文档存在冲突：先停止该部分实现并报告冲突，不要自行猜测」——本节即该报告。
- 未修改任何 Phase 0 文档；未引入 NestJS / Prisma / MySQL / Redis / Nginx 等禁用项。

## 6. 决策记录（2026-08-30）

**已确认走路线 B**：使用现有 PG 模式环境 + JS SDK v3 `app.rdb()` + RLS 行级安全。

理由：对终端用户产品效果与路线 A 一致；与 Phase 0「简单读走 SDK、写走云函数」的分层最接近，仅替换存储引擎；是平台对 PG 模式新业务的官方推荐路径；与未来 NestJS + Prisma + PostgreSQL 演进方向同引擎。

已同步修改文档（先文档后编码）：`docs/DATABASE.md`（存储引擎决策 + PG 实现原则 + Phase 1 表结构）、`docs/ARCHITECTURE.md`（架构图 / 调用分层 / 身份与权限）、`AGENTS.md`（PG 边界说明）。

遗留事项不变：小程序 AppID、微信开发者工具安装、小程序端闭环与 A/B 双账号实测（另需在 CloudBase 身份认证中配置微信小程序登录 provider）。

## 7. 最终闭环验证结果（2026-08-31）

真实微信小程序端闭环全部打通：

| 验证项                                 | 结果                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| uni-app 构建产物在微信开发者工具运行   | 通过                                                                            |
| CloudBase 初始化（js-sdk v3，PG 环境） | 通过                                                                            |
| signInWithOpenId 真实用户静默登录      | 通过（uid 20940877…，JWT role=authenticated，经小程序认证的 wx.cloud 通道签发） |
| devices 表客户端 CRUD（app.rdb）       | 通过（创建/读取/更新/删除）                                                     |
| 用户隔离（真实链路）                   | 通过：真实用户仅能看到自己名下数据；预置的其他用户（gf-user-a/b）设备完全不可见 |
| 服务端 RLS 矩阵（角色模拟 T1-T9）      | 通过                                                                            |

关键事实记录：

1. rdb 查询在数据库侧以 `authenticated` 角色执行，JWT claims（sub=用户 uid）完整传递，`auth.uid()` 生效。
2. 小程序认证（appid ↔ 环境绑定）是 wx.cloud 通道身份签发的前提；无需在 CloudBase 手工配置 AppSecret provider。
3. 曾误启用「微信开放平台登录」（OAUTH 网页通道，不适用于小程序）并已删除；其中出现过一次 AppSecret 明文（工具输出），因当前架构不依赖 AppSecret，建议在小程序后台直接「重置」使其失效即可，无需其他操作。
4. 数据库遗留：`gf_diag_view` 诊断视图保留（只读、无敏感信息），验证页含临时诊断项，Phase 2 重做页面时移除。

## 8. Phase 1 完成结论

除「双账号多开互测」（可选加强项，工具路径：开发者工具 → 多账号调试）外，Phase 1 完成标准全部满足。
