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

## AI 数据结构

当前基线包含账号标识的二进制比较规则、`users(openid,status)` 索引以及两张 AI 表。线上 AI 表均为管理员专用；新建环境时还需单独配置并核验权限。基线仅供空库使用，不是现有环境升级脚本。云端 SDK 的条件更新和账号状态冻结已用虚构数据验证；真实账号注销未做破坏性演练，见 [数据库方案](PHASE12-DATABASE-PLAN.md)。
