<template>
  <div class="app-progress" role="progressbar" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="safePercent">
    <div class="app-progress-track">
      <span class="app-progress-bar" :style="{ width: `${safePercent}%` }" />
    </div>
    <span class="app-progress-text">{{ safePercent.toFixed(1) }}%</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  percentage: {
    type: Number,
    default: 0
  }
})

const safePercent = computed(() => {
  const value = Number(props.percentage || 0)
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
})
</script>

<style lang="scss" scoped>
.app-progress {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto;
}

.app-progress-track {
  background: #e9effa;
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.app-progress-bar {
  background: linear-gradient(90deg, #4f8cff 0%, #42c19d 100%);
  border-radius: inherit;
  display: block;
  height: 100%;
  transition: width 0.2s ease;
}

.app-progress-text {
  color: #7886a1;
  font-size: 12px;
}
</style>
