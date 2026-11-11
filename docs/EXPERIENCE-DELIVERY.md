# 自用体验版交付

当前已设为体验版的是 1.2.2，备份文件、设备和测试图片恢复均经本人 iPhone 验证。保修提醒有一次实际收件确认；每小时触发配置已确认上传，自然整点运行尚未单独观察。

上传前运行 lint、type-check、test、test:api、test:database、test:release、build:mp-weixin:release 和 verify:phase10。本地检查、云端部署、版本上传、设置体验版及手机验收分别核实。发布构建不包含服务端云函数；云函数需独立部署。

目前不公开上架；未来公开发布要求见 [LAUNCH.md](LAUNCH.md)。
