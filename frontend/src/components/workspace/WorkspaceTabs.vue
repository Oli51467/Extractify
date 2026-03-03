<template>
  <div class="project-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="project-tab"
      :class="{ 'is-active': activeTab === tab.key }"
      @click="emit('update:activeTab', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTab: {
    type: String,
    default: 'documents'
  }
})

const emit = defineEmits(['update:activeTab'])
</script>

<style lang="scss" scoped>
.project-tabs {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.project-tab {
  border: 1px solid #dfe6f3;
  background: #fff;
  color: #6f7b93;
  border-radius: 999px;
  padding: 0.34rem 0.8rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.project-tab.is-active {
  color: #326adf;
  border-color: #98b6f8;
  background: #f2f7ff;
}
</style>
