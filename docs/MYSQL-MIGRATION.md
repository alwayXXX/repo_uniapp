# CloudBase MySQL 迁移记录（2026-10-07）

## 当前环境

- 小程序 AppID：`wx8f26567f4d54b3f7`
- CloudBase 环境：`myrepo-d7go4fyg918beac63`（ap-shanghai，体验版套餐）
- 数据库：CloudBase MySQL 8.0 Serverless
- MySQL 实例：`cynosdbmysql-ins-p7pgg0af`
- 专用数据库：`myrepo-d7go4fyg918beac63`

原 PG 环境因欠费注销。当前环境没有 PostgreSQL 实例；业务表通过 CloudBase MySQL 重建，旧环境数据未迁移。

## 当前架构

```text
uni-app 微信小程序
  → wx.cloud.init({ env: CLOUDBASE_ENV_ID })
  → wx.cloud.callFunction('gearflow-api')
  → 云函数从运行环境读取微信 OPENID
  → @cloudbase/node-sdk app.rdb() 访问 CloudBase MySQL
```

不再使用：

- `@cloudbase/js-sdk`
- `wx-login` code2session 与自定义登录票据
- AppSecret / 自定义登录私钥
- PostgreSQL `app.rdb()`、RLS、PL/pgSQL RPC 与 `cloudbase/migrations/`

这些内容仍保留在仓库中作为 Phase 0-10 历史记录，但不是当前运行路径。

## 数据库结构

来源文件：

- `database/mysql/schema.sql`
- `database/mysql/seed.sql`

表：

- `users`
- `device_categories`
- `devices`
- `warranties`
- `maintenance_records`
- `device_costs`
- `device_timelines`
- `consent_records`

每个用户业务表都有 `openid` 列。客户端不传 `openid`；云函数始终使用 `cloud.getWXContext().OPENID` 作为唯一可信归属值。

## 云函数

代码：`cloudfunctions/gearflow-api/index.js`

当前 action：

- `auth.bootstrap`
- `auth.current`
- `auth.updateProfile`
- `auth.deleteAccount`
- `category.list`
- `device.save`
- `device.list`
- `device.get`
- `device.softDelete`
- `warranty.get`
- `warranty.list`
- `maintenance.page`
- `maintenance.get`
- `maintenance.recent`
- `maintenance.add`
- `maintenance.update`
- `maintenance.delete`
- `timeline.list`
- `stats.overview`
- `dashboard.get`
- `health`

所有写入在云函数内再次校验字段和归属；关系操作带有失败补偿，避免产生明显部分写入。

## 部署

```bash
npx --package @cloudbase/cli tcb fn deploy gearflow-api -e myrepo-d7go4fyg918beac63 --force
```

`cloudbaserc.json` 固定函数运行时为 `Nodejs18.15`，依赖由云端安装。

## 已验证

2026-10-07 使用微信开发者工具真实小程序上下文完成：

- `auth.bootstrap` 创建用户并记录协议版本
- `auth.current` 读取当前用户
- `category.list` 读取 12 个系统分类
- 设备创建、列表、保修读取
- 维护创建、统计汇总、首页看板
- 维护删除、设备软删除
- 注销后用户为空，随后可重新 bootstrap

本地质量门另行执行：类型检查、ESLint、149 项单测和微信小程序构建。
