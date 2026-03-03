<template>
  <div class="app-empty">
    <div class="app-empty-icon">·</div>
    <p>{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  description: {
    type: String,
    default: '暂无数据'
  }
})
</script>

<style lang="scss" scoped>
.app-empty {
  align-items: center;
  color: #8b97ae;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  min-height: 140px;
  padding: 0.9rem;
  text-align: center;
}

.app-empty-icon {
  align-items: center;
  border: 1px solid #dbe4f3;
  border-radius: 999px;
  color: #b4bfd3;
  display: inline-flex;
  font-size: 22px;
  font-weight: 700;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.app-empty p {
  font-size: 13px;
  margin: 0;
}
</style>
