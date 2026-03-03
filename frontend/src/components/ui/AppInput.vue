<template>
  <label class="app-input" :class="[`is-${size}`, { 'has-prefix': !!$slots.prefix }]">
    <span v-if="$slots.prefix" class="app-input-prefix">
      <slot name="prefix" />
    </span>
    <input
      ref="inputRef"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emit('update:modelValue', $event.target.value)"
      @keyup.enter="emit('enter')"
    />
    <button
      v-if="clearable && modelValue"
      type="button"
      class="app-input-clear"
      :disabled="disabled"
      @click="emit('update:modelValue', '')"
    >
      x
    </button>
  </label>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'text'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  clearable: {
    type: Boolean,
    default: false
  },
  size: {
    type: String,
    default: 'md'
  }
})

const emit = defineEmits(['update:modelValue', 'enter'])

const inputRef = ref(null)

defineExpose({
  focus: () => inputRef.value?.focus()
})
</script>

<style lang="scss" scoped>
.app-input {
  align-items: center;
  background: #fff;
  border: 1px solid #d9e2f3;
  border-radius: 10px;
  box-shadow: 0 8px 20px -20px rgba(33, 51, 84, 0.9);
  color: #2a3550;
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 0 10px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  width: 100%;
}

.app-input:focus-within {
  border-color: #8fb0f7;
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.16);
}

.app-input input {
  background: transparent;
  border: 0;
  color: inherit;
  flex: 1;
  font-size: 14px;
  line-height: 1;
  min-width: 0;
  outline: none;
}

.app-input input::placeholder {
  color: #95a1b7;
}

.app-input-prefix {
  color: #8895ad;
  display: inline-flex;
  font-size: 14px;
}

.app-input-clear {
  background: transparent;
  border: 0;
  color: #8b97ae;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0;
}

.app-input.is-sm {
  min-height: 32px;
  padding: 0 9px;
}

.app-input.is-sm input {
  font-size: 13px;
}
</style>
