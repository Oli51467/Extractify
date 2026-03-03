<template>
  <teleport to="body">
    <div v-if="modelValue" class="app-modal" @click.self="closeOnBackdrop && emit('update:modelValue', false)">
      <div class="app-modal-panel" :style="panelStyle">
        <header class="app-modal-header">
          <slot name="title">
            <h3>{{ title }}</h3>
          </slot>
          <button class="app-modal-close" type="button" @click="emit('update:modelValue', false)">x</button>
        </header>
        <div class="app-modal-body">
          <slot />
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  width: {
    type: String,
    default: 'min(860px, 92vw)'
  },
  closeOnBackdrop: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue'])

const panelStyle = computed(() => ({ width: props.width }))
</script>

<style lang="scss" scoped>
.app-modal {
  align-items: center;
  background: rgba(18, 27, 44, 0.55);
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  padding: 18px;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 9990;
}

.app-modal-panel {
  background: #fff;
  border: 1px solid #e5ecfa;
  border-radius: 14px;
  box-shadow: 0 32px 64px -36px rgba(13, 23, 40, 0.75);
  max-height: calc(100vh - 36px);
  overflow: auto;
}

.app-modal-header {
  align-items: center;
  border-bottom: 1px solid #edf1f8;
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 0.95rem;
}

.app-modal-header h3 {
  color: #2a3550;
  font-size: 16px;
  margin: 0;
}

.app-modal-close {
  background: transparent;
  border: 0;
  color: #8390a8;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0;
}

.app-modal-body {
  padding: 0.95rem;
}
</style>
