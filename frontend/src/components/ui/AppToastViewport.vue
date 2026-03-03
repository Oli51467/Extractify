<template>
  <teleport to="body">
    <div class="toast-viewport" aria-live="polite" aria-atomic="true">
      <div
        v-for="item in store.items"
        :key="item.id"
        class="toast-item"
        :class="`is-${item.type}`"
      >
        <span class="toast-dot" />
        <span class="toast-text">{{ item.message }}</span>
        <button class="toast-close" type="button" @click="notify.dismiss(item.id)">×</button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { notify, useNotifyStore } from '../../services/notify'

const store = useNotifyStore()
</script>

<style lang="scss" scoped>
.toast-viewport {
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: fixed;
  right: 16px;
  width: min(360px, calc(100vw - 32px));
  z-index: 9999;
}

.toast-item {
  align-items: center;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e4ebf9;
  border-radius: 12px;
  box-shadow: 0 16px 42px -24px rgba(29, 46, 76, 0.45);
  color: #2a3550;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr auto;
  padding: 10px 12px;
}

.toast-dot {
  border-radius: 999px;
  height: 9px;
  width: 9px;
}

.toast-text {
  font-size: 13px;
  line-height: 1.4;
}

.toast-close {
  background: transparent;
  border: 0;
  color: #8792ab;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0;
}

.toast-item.is-success .toast-dot {
  background: #33b287;
}

.toast-item.is-error .toast-dot {
  background: #e16363;
}

.toast-item.is-warning .toast-dot {
  background: #d98d36;
}

.toast-item.is-info .toast-dot {
  background: #4f8cff;
}
</style>
