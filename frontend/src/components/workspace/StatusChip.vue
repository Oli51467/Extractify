<template>
  <span class="status-chip" :class="`is-${status}`">{{ status }}</span>
</template>

<script setup>
defineProps({
  status: {
    type: String,
    default: ''
  }
})
</script>

<style lang="scss" scoped>
.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.08rem 0.44rem;
  font-size: 0.7rem;
  border: 1px solid transparent;
}

.status-chip.is-completed {
  color: #1a8f67;
  border-color: #bae9d9;
  background: #f2fcf7;
}

.status-chip.is-processing,
.status-chip.is-queued {
  color: #2d64d6;
  border-color: #c8d9fb;
  background: #f2f7ff;
}

.status-chip.is-failed {
  color: #d35050;
  border-color: #f3c8c8;
  background: #fff7f7;
}

.status-chip.is-completed_with_errors {
  color: #ad6d17;
  border-color: #f4ddb8;
  background: #fff9ef;
}

.status-chip.is-cancelled {
  color: #65728c;
  border-color: #d7deeb;
  background: #f7f9fc;
}
</style>
