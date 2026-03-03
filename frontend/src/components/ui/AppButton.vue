<template>
  <button
    :type="nativeType"
    :class="buttonClass"
    :disabled="isDisabled"
    @click="handleClick"
  >
    <span v-if="loading" class="app-btn__spinner" />
    <span v-else-if="$slots.icon" class="app-btn__icon">
      <slot name="icon" />
    </span>
    <span v-if="$slots.default" class="app-btn__label">
      <slot />
    </span>
  </button>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  tone: {
    type: String,
    default: 'primary'
  },
  variant: {
    type: String,
    default: 'solid'
  },
  size: {
    type: String,
    default: 'md'
  },
  shape: {
    type: String,
    default: 'rounded'
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  block: {
    type: Boolean,
    default: false
  },
  nativeType: {
    type: String,
    default: 'button'
  }
})

const emit = defineEmits(['click'])
const slots = useSlots()

const isDisabled = computed(() => props.disabled || props.loading)

const buttonClass = computed(() => [
  'app-btn',
  `is-${props.variant}`,
  `is-${props.tone}`,
  `is-${props.size}`,
  `is-${props.shape}`,
  {
    'is-loading': props.loading,
    'is-block': props.block,
    'is-icon-only': !slots.default
  }
])

const handleClick = (event) => {
  if (isDisabled.value) return
  emit('click', event)
}
</script>

<style lang="scss" scoped>
.app-btn {
  --btn-bg: linear-gradient(135deg, #4f8cff 0%, #3f79f3 100%);
  --btn-border: transparent;
  --btn-color: #fff;
  --btn-shadow: 0 10px 24px -14px rgba(63, 121, 243, 0.75);
  --btn-bg-hover: linear-gradient(135deg, #5a95ff 0%, #4a83fd 100%);
  --btn-shadow-hover: 0 16px 28px -18px rgba(63, 121, 243, 0.75);
  --btn-bg-active: linear-gradient(135deg, #467feb 0%, #356ce2 100%);
  --btn-spinner: rgba(255, 255, 255, 0.95);

  align-items: center;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  border-radius: 12px;
  box-shadow: var(--btn-shadow);
  color: var(--btn-color);
  cursor: pointer;
  display: inline-flex;
  font-size: 14px;
  font-weight: 600;
  gap: 0.45rem;
  justify-content: center;
  letter-spacing: 0.01em;
  min-width: 84px;
  padding: 0 1rem;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  user-select: none;
  white-space: nowrap;
}

.app-btn.is-sm {
  border-radius: 10px;
  font-size: 13px;
  height: 32px;
  min-width: 72px;
  padding: 0 0.85rem;
}

.app-btn.is-md {
  height: 38px;
}

.app-btn.is-lg {
  border-radius: 14px;
  font-size: 15px;
  height: 44px;
  min-width: 96px;
  padding: 0 1.2rem;
}

.app-btn.is-rounded {
  border-radius: 12px;
}

.app-btn.is-pill {
  border-radius: 999px;
}

.app-btn.is-circle,
.app-btn.is-icon-only {
  min-width: 0;
  padding: 0;
}

.app-btn.is-sm.is-circle,
.app-btn.is-sm.is-icon-only {
  border-radius: 999px;
  height: 32px;
  width: 32px;
}

.app-btn.is-md.is-circle,
.app-btn.is-md.is-icon-only {
  border-radius: 999px;
  height: 38px;
  width: 38px;
}

.app-btn.is-lg.is-circle,
.app-btn.is-lg.is-icon-only {
  border-radius: 999px;
  height: 44px;
  width: 44px;
}

.app-btn.is-block {
  display: flex;
  width: 100%;
}

.app-btn:hover:not(:disabled) {
  background: var(--btn-bg-hover);
  box-shadow: var(--btn-shadow-hover);
  transform: translateY(-1px);
}

.app-btn:active:not(:disabled) {
  background: var(--btn-bg-active);
  box-shadow: var(--btn-shadow);
  transform: translateY(0);
}

.app-btn:focus-visible {
  outline: 2px solid rgba(79, 140, 255, 0.45);
  outline-offset: 2px;
}

.app-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.app-btn.is-primary {
  --btn-bg: linear-gradient(135deg, #4f8cff 0%, #3f79f3 100%);
  --btn-bg-hover: linear-gradient(135deg, #5a95ff 0%, #4a83fd 100%);
  --btn-bg-active: linear-gradient(135deg, #467feb 0%, #356ce2 100%);
  --btn-shadow: 0 10px 24px -14px rgba(63, 121, 243, 0.75);
  --btn-shadow-hover: 0 16px 28px -18px rgba(63, 121, 243, 0.75);
}

.app-btn.is-success {
  --btn-bg: linear-gradient(135deg, #32bf94 0%, #2da57f 100%);
  --btn-bg-hover: linear-gradient(135deg, #3cca9f 0%, #34b18a 100%);
  --btn-bg-active: linear-gradient(135deg, #2fad86 0%, #289874 100%);
  --btn-shadow: 0 10px 24px -14px rgba(45, 165, 127, 0.75);
  --btn-shadow-hover: 0 16px 28px -18px rgba(45, 165, 127, 0.75);
}

.app-btn.is-danger {
  --btn-bg: linear-gradient(135deg, #f56c6c 0%, #e45656 100%);
  --btn-bg-hover: linear-gradient(135deg, #ff7878 0%, #ee6262 100%);
  --btn-bg-active: linear-gradient(135deg, #eb6060 0%, #d84b4b 100%);
  --btn-shadow: 0 10px 24px -14px rgba(228, 86, 86, 0.75);
  --btn-shadow-hover: 0 16px 28px -18px rgba(228, 86, 86, 0.75);
}

.app-btn.is-neutral {
  --btn-bg: linear-gradient(135deg, #60708f 0%, #4d5d79 100%);
  --btn-bg-hover: linear-gradient(135deg, #6a7b9b 0%, #596a88 100%);
  --btn-bg-active: linear-gradient(135deg, #596986 0%, #4a5a75 100%);
  --btn-shadow: 0 10px 24px -14px rgba(77, 93, 121, 0.75);
  --btn-shadow-hover: 0 16px 28px -18px rgba(77, 93, 121, 0.75);
}

.app-btn.is-outline {
  --btn-bg: #ffffff;
  --btn-bg-hover: #f7f9ff;
  --btn-bg-active: #eef3ff;
  --btn-border: #d6e1ff;
  --btn-color: #3f79f3;
  --btn-shadow: 0 10px 24px -18px rgba(63, 121, 243, 0.35);
  --btn-shadow-hover: 0 14px 30px -22px rgba(63, 121, 243, 0.4);
  --btn-spinner: #3f79f3;
}

.app-btn.is-outline.is-success {
  --btn-border: #b9e8d8;
  --btn-color: #2da57f;
  --btn-bg-hover: #f4fdf9;
  --btn-bg-active: #e8f8f1;
  --btn-shadow: 0 10px 24px -18px rgba(45, 165, 127, 0.35);
  --btn-shadow-hover: 0 14px 30px -22px rgba(45, 165, 127, 0.4);
  --btn-spinner: #2da57f;
}

.app-btn.is-outline.is-danger {
  --btn-border: #f5c2c2;
  --btn-color: #e45656;
  --btn-bg-hover: #fff8f8;
  --btn-bg-active: #ffefef;
  --btn-shadow: 0 10px 24px -18px rgba(228, 86, 86, 0.35);
  --btn-shadow-hover: 0 14px 30px -22px rgba(228, 86, 86, 0.4);
  --btn-spinner: #e45656;
}

.app-btn.is-outline.is-neutral {
  --btn-border: #cad3e0;
  --btn-color: #4d5d79;
  --btn-bg-hover: #f7f9fc;
  --btn-bg-active: #eff3f8;
  --btn-shadow: 0 10px 24px -18px rgba(77, 93, 121, 0.35);
  --btn-shadow-hover: 0 14px 30px -22px rgba(77, 93, 121, 0.4);
  --btn-spinner: #4d5d79;
}

.app-btn.is-ghost {
  --btn-bg: rgba(63, 121, 243, 0.1);
  --btn-bg-hover: rgba(63, 121, 243, 0.16);
  --btn-bg-active: rgba(63, 121, 243, 0.2);
  --btn-border: rgba(63, 121, 243, 0.2);
  --btn-color: #3f79f3;
  --btn-shadow: none;
  --btn-shadow-hover: none;
  --btn-spinner: #3f79f3;
}

.app-btn.is-ghost.is-success {
  --btn-bg: rgba(45, 165, 127, 0.12);
  --btn-bg-hover: rgba(45, 165, 127, 0.18);
  --btn-bg-active: rgba(45, 165, 127, 0.22);
  --btn-border: rgba(45, 165, 127, 0.25);
  --btn-color: #2da57f;
  --btn-spinner: #2da57f;
}

.app-btn.is-ghost.is-danger {
  --btn-bg: rgba(228, 86, 86, 0.12);
  --btn-bg-hover: rgba(228, 86, 86, 0.18);
  --btn-bg-active: rgba(228, 86, 86, 0.22);
  --btn-border: rgba(228, 86, 86, 0.24);
  --btn-color: #e45656;
  --btn-spinner: #e45656;
}

.app-btn.is-ghost.is-neutral {
  --btn-bg: rgba(77, 93, 121, 0.12);
  --btn-bg-hover: rgba(77, 93, 121, 0.18);
  --btn-bg-active: rgba(77, 93, 121, 0.22);
  --btn-border: rgba(77, 93, 121, 0.24);
  --btn-color: #4d5d79;
  --btn-spinner: #4d5d79;
}

.app-btn__icon {
  display: inline-flex;
  line-height: 0;
}

.app-btn__icon :deep(svg) {
  display: block;
  height: 1.05em;
  width: 1.05em;
}

.app-btn__spinner {
  animation: app-btn-spin 0.8s linear infinite;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: var(--btn-spinner);
  border-radius: 50%;
  display: inline-block;
  height: 0.95em;
  width: 0.95em;
}

.app-btn.is-outline .app-btn__spinner,
.app-btn.is-ghost .app-btn__spinner {
  border-color: rgba(63, 121, 243, 0.2);
}

.app-btn__label {
  display: inline-flex;
  gap: 0.35rem;
  line-height: 1;
}

@keyframes app-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
