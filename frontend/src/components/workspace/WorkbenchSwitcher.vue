<template>
  <section class="workspace-switcher" aria-label="工作台切换">
    <router-link
      to="/"
      class="workspace-switch-link"
      :class="{ 'is-active': route.path === '/' }"
    >
      Extract
    </router-link>
    <router-link
      to="/mergify"
      class="workspace-switch-link"
      :class="{ 'is-active': route.path === '/mergify' }"
    >
      Merge
    </router-link>
  </section>
</template>

<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<style lang="scss" scoped>
.workspace-switcher {
  background: #fff;
  border: 1px solid #e8edf6;
  border-radius: 12px;
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.35rem;
}

.workspace-switch-link {
  border: 1px solid transparent;
  border-radius: 10px;
  color: #6d7a92;
  font-size: 0.88rem;
  font-weight: 600;
  min-width: 126px;
  padding: 0.44rem 0.78rem;
  text-align: center;
  text-decoration: none;
  transition: all 0.18s ease;
}

.workspace-switch-link:hover {
  background: #f5f8ff;
  color: #3968cf;
}

.workspace-switch-link.is-active {
  background: linear-gradient(135deg, #4f8cff 0%, #3f79f3 100%);
  box-shadow: 0 8px 18px -14px rgba(63, 121, 243, 0.75);
  color: #fff;
}

@media (max-width: 768px) {
  .workspace-switcher {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }

  .workspace-switch-link {
    min-width: 0;
  }
}
</style>
