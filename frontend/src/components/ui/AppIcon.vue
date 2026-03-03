<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      v-for="(segment, index) in iconSegments"
      :key="index"
      :d="segment.d"
      :stroke="segment.stroke || 'currentColor'"
      :stroke-width="segment.strokeWidth || 1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      :fill="segment.fill || 'none'"
    />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true
  }
})

const iconMap = {
  plus: [
    { d: 'M12 5v14' },
    { d: 'M5 12h14' }
  ],
  delete: [
    { d: 'M5 7h14' },
    { d: 'M9 7V5h6v2' },
    { d: 'M8 7l1 12h6l1-12' }
  ],
  refresh: [
    { d: 'M20 12a8 8 0 1 1-2.2-5.5' },
    { d: 'M20 4v5h-5' }
  ],
  edit: [
    { d: 'M4 20h4.5L19 9.5 14.5 5 4 15.5V20Z' },
    { d: 'm12.8 6.7 4.5 4.5' }
  ],
  download: [
    { d: 'M12 4v10' },
    { d: 'm8 10 4 4 4-4' },
    { d: 'M4 18h16' }
  ],
  chevronDown: [
    { d: 'm6 9 6 6 6-6' }
  ],
  search: [
    { d: 'm21 21-4.2-4.2' },
    { d: 'M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4' }
  ],
  upload: [
    { d: 'M12 20V10' },
    { d: 'm8 14 4-4 4 4' },
    { d: 'M4 20h16' }
  ],
  share: [
    { d: 'M15 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
    { d: 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
    { d: 'M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
    { d: 'm8.6 10.4 3.8-2.2' },
    { d: 'm8.8 13.2 6.3 3.1' }
  ],
  close: [
    { d: 'm6 6 12 12' },
    { d: 'm18 6-12 12' }
  ]
}

const iconSegments = computed(() => iconMap[props.name] || iconMap.plus)
</script>

<style lang="scss" scoped>
.app-icon {
  display: inline-block;
  height: 1em;
  width: 1em;
}
</style>
