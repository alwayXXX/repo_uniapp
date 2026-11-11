# CloudBase MySQL 运行配置

业务环境 myrepo-d7go4fyg918beac63 使用 CloudBase MySQL 8.0 Serverless；小程序通过 wx.cloud.callFunction 调用 gearflow-api，服务端以微信可信 OPENID 隔离数据。项目不依赖客户端数据库直连或自定义登录私钥。

新环境建库基线和系统分类种子见 database/mysql/schema.sql、database/mysql/seed.sql；实际线上表结构须在操作前核实。P12 数据库草案与维护流程见 [数据库方案](PHASE12-DATABASE-PLAN.md)。
