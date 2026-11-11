# 数据库与数据保护

当前业务使用 CloudBase 托管 MySQL 8.0。建库基线为 [schema.sql](../database/mysql/schema.sql)，分类种子为 [seed.sql](../database/mysql/seed.sql)；字段、索引和约束以 SQL 与实际线上结构为准。执行 DDL 前必须检查目标环境、现有结构及备份，不能把建库脚本当作线上升级脚本重复执行。

## 主要数据

| 表                                | 用途                             |
| --------------------------------- | -------------------------------- |
| users                             | 用户状态及身份映射               |
| device_categories                 | 系统设备分类                     |
| devices                           | 设备、购买、处置信息及软删除状态 |
| warranties                        | 设备保修                         |
| maintenance_records、device_costs | 维护及费用                       |
| device_timelines                  | 设备事件                         |
| consent_records                   | 隐私协议同意记录                 |
| device_attachments                | 附件元数据及清理状态             |
| device_reminders                  | 一次性提醒及发送状态             |

业务操作由 gearflow-api 使用可信微信身份校验，用户数据按归属过滤；客户端不得指定身份。系统分类为公共数据，管理凭据不进入客户端。价格以整数分计；统计默认排除软删除设备，维护费用和处置收入按业务口径计算。

## 删除与备份

设备删除采用软删除；账号注销须清除或匿名化个人资料和关联数据，并清理附件云文件。文件清理失败须保留可重试状态，不能先丢弃引用。备份由本人主动生成和恢复，范围及限制见 [PHASE12.md](PHASE12.md)。

## 待执行的 AI 变更

[identity-collation-draft.sql](../database/mysql/identity-collation-draft.sql) 与 [phase12-draft.sql](../database/mysql/phase12-draft.sql) 是 P12 变更草案，不是当前线上基线。用户已同意九张表账号标识比较规则调整、维护窗口和 AI 表及索引；实际执行状态应在操作前只读核实。DDL 非原子且索引创建不可盲目重复，安全条件见 [数据库方案](PHASE12-DATABASE-PLAN.md)。
