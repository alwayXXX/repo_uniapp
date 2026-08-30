<template>
  <view class="page">
    <view class="card">
      <view class="avatar">
        <text class="avatar-mark">G</text>
      </view>
      <view class="info">
        <text class="name">GearFlow 用户</text>
        <text class="sub">账号资料将在 Phase 3 开放</text>
      </view>
    </view>

    <view class="card">
      <view class="cell">
        <text class="cell-label">用户协议</text>
        <text class="cell-value">Phase 3</text>
      </view>
      <view class="cell">
        <text class="cell-label">隐私政策</text>
        <text class="cell-value">Phase 3</text>
      </view>
      <view class="cell">
        <text class="cell-label">账号注销</text>
        <text class="cell-value">Phase 3</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
// Phase 3 接入用户体系（ROADMAP）：资料、协议、注销
</script>

<style scoped lang="scss">
.page {
  padding: $gf-space-lg $gf-space-md;
}

.card {
  margin-bottom: $gf-space-md;
  padding: $gf-space-lg;
  background-color: $gf-bg-card;
  border-radius: $gf-radius-lg;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: $gf-color-primary-weak;
  border-radius: 50%;
}

.avatar-mark {
  font-size: $gf-font-xl;
  font-weight: 600;
  color: $gf-color-primary;
}

.info {
  margin-top: $gf-space-md;
}

.name {
  font-size: $gf-font-lg;
  font-weight: 600;
  color: $gf-text-1;
}

.sub {
  display: block;
  margin-top: $gf-space-xs;
  font-size: $gf-font-sm;
  color: $gf-text-3;
}

.cell {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: $gf-space-sm 0;
}

.cell-label {
  font-size: $gf-font-md;
  color: $gf-text-1;
}

.cell-value {
  font-size: $gf-font-sm;
  color: $gf-text-3;
}
</style>
