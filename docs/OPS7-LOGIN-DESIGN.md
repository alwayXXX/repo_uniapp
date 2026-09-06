# OPS-7 登录凭据自包含化方案（自定义登录）

> 状态：已落地（2026-09-06 上线，真机验证通过；实施要点以本文件 + git 历史 9280489..fbcf0b0 为准）。

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
  → app.callFunction('wx-login', { code })        # 走 HTTP 网关（域名与现有 rdb/auth 同源）
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

## 4. 密钥管理（密钥不过聊天）

| 密钥           | 来源                                                   | 去向                                              |
| -------------- | ------------------------------------------------------ | ------------------------------------------------- |
| AppSecret      | 用户在 mp 后台重置                                     | 用户亲手粘贴进云函数环境变量 `WX_SECRET`          |
| 自定义登录私钥 | 控制台启用「自定义登录」后下载 `tcb_custom_login.json` | 用户亲手整份粘贴进环境变量 `TCB_CREDENTIALS_JSON` |

环境变量清单（云函数 wx-login）：`WX_APPID`、`WX_SECRET`、`TCB_ENV`、`TCB_CREDENTIALS_JSON`。

## 5. 身份连续性风险与预案

切换身份源后，同一微信用户在 CloudBase 可能生成**新 uid**，导致 `users.identity_id` 对不上旧行（设备/维护记录不可达）。

- 上线前基线：`users` 表快照（本次切换时表为空/不可读——PG 隔离期间，见 §1；恢复后重新快照）。
- 上线后验证：管理员微信登录 → 核对 `users` 行数与 identity_id。
- 若 uid 变化：执行一次性合并迁移（旧行业务数据并入新行，旧行按注销语义匿名化），迁移脚本入库留档。

## 6. 回滚

回滚 = 恢复 `signInSilently` 走默认云开发链路（git revert 前端提交）+ 控制台重新扫码小程序认证。回滚后回到「循环发版」旧形态，不丢数据。

## 7. 迁移完成后的终态

1. 解除微信侧第三方授权（微搭），**不再重新授权**——版本管理永久可用。
2. mp 后台服务器域名手动配置（原自动托管失效）：request 合法域名加 `https://myrepo-d1gfju7se642a63ce.api.tcloudbasegateway.com`。
3. 旧 WX_QRCODE_MICRO_APP 身份源停用（保留观察一个版本后删除）。
4. 发版流程回归：CLI 上传 → 设为体验版，两步。
