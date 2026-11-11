# Phase 12 数据库变更方案

目标是业务环境 myrepo-d7go4fyg918beac63 的 CloudBase MySQL。用户已同意的九张现有表 OPENID 排序规则调整、users(openid,status) 联合索引及两张 AI 表已应用。检查确认两张表的级联外键和 ADMINONLY 权限；维护完成后已恢复原业务函数并通过健康检查，本人确认手机设备列表、详情和保修提醒页面正常。脚本中的非幂等 DDL 不得重复执行。

## 变更与用途

先审查 [identity-collation-draft.sql](../database/mysql/identity-collation-draft.sql) 的九张表及 utf8mb4_0900_bin 比较规则，再审查 [phase12-draft.sql](../database/mysql/phase12-draft.sql) 的索引及两个 AI 表。额度表用于每日限流，授权表用于一次性凭证并发消费；不得保存明文凭证、图片、设备摘要或模型回复。账号进入删除状态时须冻结授权，注销时清除对应记录。

## 后续验证与维护原则

1. 已使用一个虚构账号验证 CloudBase SDK 的限额条件更新、授权单次消费及账号状态冻结，测试数据已核实清除；完整业务链路和真实账号注销仍需单独验证，不对真实账号做破坏性演练。
2. 每次结构变更前核对可用备份、线上结构、数据关系、权限及恢复包；如须暂停写入，确认维护入口不执行业务或提醒，再等待原函数最大执行时间。
3. MySQL DDL 各自提交；失败先核对实际状态，不自动删除表或盲目回滚。恢复前核对函数代码及触发器保护方式。

本地无网络 MySQL 8 容器已用虚构数据验证草案的身份隔离和外键冻结；node scripts/phase12-mysql-isolation.mjs 可在有本地 MySQL 8 Docker 镜像时重现。此结果不能代替 CloudBase 权限、SDK、iPhone 和微信原生定时器验证。AI 入口不得在依赖条件与真实链路验证完成前部署。
