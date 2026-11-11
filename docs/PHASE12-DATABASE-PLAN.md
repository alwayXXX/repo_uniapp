# Phase 12 数据库变更方案

目标是业务环境 myrepo-d7go4fyg918beac63 的 CloudBase MySQL。现有记录显示相关 DDL 尚未执行，本次整理没有访问线上；执行前必须只读核实表、列、索引、外键和数据关系。用户已同意新建 ai_daily_quota、ai_grants、users(openid,status) 联合索引，以及九张现有表的 OPENID 排序规则调整和临时维护。

## 变更与用途

先审查 [identity-collation-draft.sql](../database/mysql/identity-collation-draft.sql) 的九张表及 utf8mb4_0900_bin 比较规则，再审查 [phase12-draft.sql](../database/mysql/phase12-draft.sql) 的索引及两个 AI 表。额度表用于每日限流，授权表用于一次性凭证并发消费；不得保存明文凭证、图片、设备摘要或模型回复。账号进入删除状态时须冻结授权，注销时清除对应记录。

## 执行前与恢复

1. 验证可用备份，核对线上结构、大小写冲突、孤儿记录、外键和权限。确认维护入口及原云函数代码、配置、触发器的恢复方式。
2. 切换业务函数至维护入口，确认不执行业务或提醒；等待至少原函数最大执行时间 60 秒，再复查表结构和数据关系。维护期间小程序不能正常使用，提醒会延后。
3. 逐条执行已核准的 DDL 并核验每一步。MySQL DDL 各自提交，索引创建不幂等；失败立即停止并保持维护，核对实际状态，不自动删除表或盲目回滚。
4. 核验表权限、外键、CloudBase SDK 条件更新、账号隔离和注销冻结；仅用隔离测试数据。验证恢复包和触发器后恢复业务。

本地无网络 MySQL 8 容器已用虚构数据验证草案的身份隔离和外键冻结；node scripts/phase12-mysql-isolation.mjs 可在有本地 MySQL 8 Docker 镜像时重现。此结果不能代替 CloudBase 权限、SDK、iPhone 和微信原生定时器验证。AI 入口不得在依赖条件与真实链路验证完成前部署。
