<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { ensureCloudbaseInit } from '@/services/cloudbase'
import { toAppError } from '@/utils/error'
import { clearPreviewFiles } from '@/services/preview-files'

onShow(() => {
  try {
    clearPreviewFiles()
  } catch {
    uni.showToast({ title: '附件预览文件清理失败，请重试', icon: 'none' })
  }
})

onLaunch(() => {
  try {
    ensureCloudbaseInit()
  } catch (err) {
    // 初始化失败不阻塞启动；验证页面会展示具体错误与修复方式
    console.error('CloudBase init failed:', toAppError(err).code)
  }
})
</script>

<style lang="scss">
@import '@wot-ui/ui/styles/theme/index.scss';

/* Shared baseline: keep native controls readable across WeChat iOS and Android. */
page {
  min-height: 100%;
  background-color: #f5f7fa;
  font-size: 28rpx;
  color: #202124;
  font-family: 'Noto Sans SC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --wot-blue-6: #1a73e8;
}

view,
text,
button,
input,
textarea {
  font-family: 'Noto Sans SC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
  box-sizing: border-box;
}

input,
textarea {
  display: block;
}

button {
  min-height: 88rpx;
  padding: 0 24rpx;
  line-height: 1.35;
  border-radius: 12rpx;
}

button::after {
  border: 0;
}

/* Wot renders its own input root. Keep a visible touch target in forms. */
.wd-input.gf-wot-input,
.wd-textarea.gf-wot-textarea {
  border: 1rpx solid #edf0f3;
  border-radius: 14rpx;
  box-sizing: border-box;
  background: #f7f8fa;
}

/* Full-width Wot actions keep account controls in a readable vertical list. */
.wd-button.gf-profile-action {
  width: 100%;
  min-height: 88rpx;
  padding: 0;
  margin: 0;
  color: #283a50;
  border-radius: 0;
  border-bottom: 1rpx solid #eef1f5;
}
.wd-button.gf-profile-action .wd-button__content {
  justify-content: flex-start;
}
.wd-button.gf-profile-danger {
  color: #c83c36;
}

.wd-button.gf-tool-action {
  width: 100%;
  height: auto;
  min-height: 88rpx;
  margin: 0;
  padding: 0;
  border-radius: 0;
  border-bottom: 1rpx solid #eef1f5;
}
.wd-button.gf-tool-action .wd-button__content,
.wd-button.gf-tool-action .wd-button__text {
  width: 100%;
}
.wd-input.gf-wot-input {
  min-height: 48px;
  --wot-input-padding: 0 24rpx;
  --wot-input-inner-height: 48px;
}
.wd-textarea.gf-wot-textarea {
  min-height: 176rpx;
  --wot-textarea-padding: 20rpx 24rpx;
  --wot-textarea-inner-min-height: 130rpx;
}
</style>
