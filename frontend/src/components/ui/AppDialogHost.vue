<template>
  <teleport to="body">
    <div v-if="store.visible" class="dialog-mask" @click.self="dialogActions.cancel()">
      <div class="dialog-panel">
        <h3>{{ store.title }}</h3>
        <p v-if="store.message" class="dialog-message">{{ store.message }}</p>

        <AppInput
          v-if="store.mode === 'prompt'"
          :model-value="store.inputValue"
          @update:model-value="dialogActions.setInputValue"
          @enter="dialogActions.confirm"
        />

        <div class="dialog-actions">
          <AppButton tone="neutral" variant="outline" size="sm" @click="dialogActions.cancel">
            {{ store.cancelText }}
          </AppButton>
          <AppButton size="sm" @click="dialogActions.confirm">
            {{ store.confirmText }}
          </AppButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { dialogActions, useDialogStore } from '../../services/dialog'
import AppButton from './AppButton.vue'
import AppInput from './AppInput.vue'

const store = useDialogStore()
</script>

<style lang="scss" scoped>
.dialog-mask {
  align-items: center;
  background: rgba(16, 25, 39, 0.56);
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  padding: 16px;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 9995;
}

.dialog-panel {
  background: #fff;
  border: 1px solid #e5ecfa;
  border-radius: 14px;
  box-shadow: 0 28px 56px -36px rgba(12, 23, 40, 0.8);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  width: min(420px, 92vw);
}

.dialog-panel h3 {
  color: #2a3550;
  font-size: 17px;
  margin: 0;
}

.dialog-message {
  color: #65728c;
  font-size: 14px;
  line-height: 1.45;
  margin: 0;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
