<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { getCloudbaseApp } from '@/services/cloudbase'

onLaunch(() => {
  try {
    getCloudbaseApp()
  } catch (err) {
    // 初始化失败不阻塞启动；验证页面会展示具体错误与修复方式
    console.error('CloudBase init failed:', err instanceof Error ? err.message : String(err))
  }
})
</script>

<style>
/* 全局基础样式（Phase 2 建立主题 Token） */
page {
  background-color: #f6f7f9;
  font-size: 28rpx;
  color: #1f2329;
}
</style>
