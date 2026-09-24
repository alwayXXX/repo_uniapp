# OPS-7 登录凭据自包含化方案（自定义登录）

> 状态：登录链路已于 2026-09-06 落地并有真机验收记录；2026-09-23 同步实际 HTTP 路由和密钥依赖。此处不是小程序正式发布证明。历史实施记录为 9280489..fbcf0b0；当前行为以源码及本文更新为准。

## 1. 背景与问题

- 登录方式中的微信小程序身份源（WX_QRCODE_MICRO_APP/OPENID）由 2026-08-30 的「扫码授权认证」产生，其验证回调锚定微搭服务（`callback.weda.tencent-cloud.com`）。
- 后果一：解绑微信侧第三方授权（为解锁版本管理）会使**登录全挂**——2026-09-05 已实际发生两次。
- 后果二：凡影响该凭据链的操作（如重置 AppSecret）同样会使登录挂掉——2026-09-05 21:00 前后已实际发生。
- 结论：**登录可用性与微信侧授权状态强耦合，必须解耦**。

另：2026-09-05 21:00 后 PostgreSQL 实例进入 Isolated 状态（独立于本方案的资源问题，恢复后数据不丢），登录验证需待其恢复。

## 2. 目标

登录链路只依赖：小程序自身 AppID + AppSecret（用户持有）+ CloudBase 环境的自定义登录能力。**不依赖微信侧任何第三方授权**，从此「控制台自由」与「登录可用」解绑。

## 3. 架构

```text
小程序 uni.login() → code
  → uni.request POST wx-login 公网路由 { code }  # 免鉴权入口，与 rdb/auth 数据网关不同域名
    → 云函数 wx-login：
        jscode2session(WX_APPID, WX_SECRET, code) → openid   # 密钥仅存函数环境变量
        node-sdk auth().createTicket(openid)                  # 需自定义登录私钥
        → { ok: true, ticket }                                # openid 不回传前端
  → auth.signInWithCustomTicket(() => ticket)
  → loginState.user.uid = users.identity_id                    # 既有 bootstrap/RPC/RLS 全部不变
```

- 云函数：`cloudfunctions/wx-login/`（Nodejs18.15，仅 `@cloudbase/node-sdk` 一个依赖，Node 18 原生 fetch）。
- 日志红线：函数日志不输出 code/openid/errcode/errmsg，仅记成功布尔与静态文案。
- 失败语义：统一返回 `{ ok:false, errorCode }`，前端映射为既有 `UNAUTHORIZED`。

当前公开登录地址：`https://myrepo-d1gfju7se642a63ce-1331619055.ap-shanghai.app.tcloudbase.com/wx-login`。不要替换成 SDK `callFunction` 或数据网关下的猜测路径。

## 4. 密钥管理（密钥不过聊天）

| 密钥           | 来源                                                   | 去向                                              |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| AppSecret      | 用户在 mp 后台重置                                     | 用户亲手粘贴进云函数环境变量 `WX_SECRET`          |
| 自定义登录私钥 | 控制台启用「自定义登录」后下载 `tcb_custom_login.json` | 用户亲手整份粘贴进环境变量 `TCB_CREDENTIALS_JSON` |

环境变量清单（云函数 wx-login）：`WX_APPID`、`WX_SECRET`、`TCB_ENV`、`TCB_CREDENTIALS_JSON`。

用户已确认曾暴露的 AppSecret 与自定义登录私钥均已更换，并已在体验版扫码登录成功。仍需记录既有数据归属连续性；仅重置微信侧 AppSecret 会中断当前登录。本轮不读取、不轮换、不部署这些密钥；“不依赖第三方授权”不等于“不依赖 AppSecret”。

## 5. 身份连续性风险与预案

切换身份源后，同一微信用户在 CloudBase 可能生成**新 uid**，导致 `users.identity_id` 对不上旧行（设备/维护记录不可达）。

- 上线前基线：`users` 表快照（本次切换时表为空/不可读——PG 隔离期间，见 §1；恢复后重新快照）。
- 上线后验证：管理员微信登录 → 核对 `users` 行数与 identity_id。
- 若 uid 变化：执行一次性合并迁移（旧行业务数据并入新行，旧行按注销语义匿名化），迁移脚本入库留档。

## 6. 回滚

回滚 = 恢复 `signInSilently` 走默认云开发链路（git revert 前端提交）+ 控制台重新扫码小程序认证。回滚后回到「循环发版」旧形态，不丢数据。

## 7. 迁移完成后的终态

1. 解除微信侧第三方授权（微搭），**不再重新授权**——版本管理永久可用。
2. mp 后台 request 合法域名同时核对数据网关 `https://myrepo-d1gfju7se642a63ce.api.tcloudbasegateway.com` 与登录域名 `https://myrepo-d1gfju7se642a63ce-1331619055.ap-shanghai.app.tcloudbase.com`；`/wx-login` 是路径，不写进域名白名单。正式构建启用 `urlCheck` 后重新真机验证。
3. 旧 WX_QRCODE_MICRO_APP 身份源停用（保留观察一个版本后删除）。
4. 体验分发流程：正式构建与检查 → 上传 → 设为体验版。正式审核发布另按 `docs/LAUNCH.md` 完成。
