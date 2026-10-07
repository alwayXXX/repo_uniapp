<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { ensureCloudbaseInit } from '@/services/cloudbase'
import { toAppError } from '@/utils/error'

onLaunch(() => {
  try {
    ensureCloudbaseInit()
  } catch (err) {
    // 初始化失败不阻塞启动；验证页面会展示具体错误与修复方式
    console.error('CloudBase init failed:', toAppError(err).code)
  }
})
</script>

<style>
/* Shared baseline: keep native controls readable across WeChat iOS and Android. */
page {
  min-height: 100%;
  background-color: #f8f9fa;
  font-size: 28rpx;
  color: #202124;
  font-family: 'Noto Sans SC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
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
</style>
