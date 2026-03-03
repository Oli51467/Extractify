<template>
  <section class="app-card">
    <header v-if="$slots.header" class="app-card-header">
      <slot name="header" />
    </header>
    <div class="app-card-body">
      <slot />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.app-card {
  background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
  border: 1px solid #e4eaf6;
  border-radius: 14px;
  box-shadow: 0 18px 36px -30px rgba(42, 58, 88, 0.7);
}

.app-card-header {
  border-bottom: 1px solid #edf1f8;
  padding: 0.75rem 0.9rem;
}

.app-card-body {
  padding: 0.9rem;
}
</style>
