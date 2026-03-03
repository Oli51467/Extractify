<template>
  <aside class="project-sidebar">
    <div class="project-workbench-switcher" aria-label="工作台切换">
      <router-link
        to="/"
        class="switch-link"
        :class="{ 'is-active': workspaceType !== 'merge' }"
      >
        Extract
      </router-link>
      <router-link
        to="/mergify"
        class="switch-link"
        :class="{ 'is-active': workspaceType === 'merge' }"
      >
        Merge
      </router-link>
    </div>

    <div class="project-sidebar-header">
      <span class="project-count">{{ projects.length }} 个项目</span>
      <AppButton size="sm" variant="outline" @click="emit('create-project')">
        <template #icon>
          <AppIcon name="plus" />
        </template>
        New Project
      </AppButton>
    </div>

    <div v-if="projects.length > 0" class="project-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-item"
        :class="{ 'is-active': project.id === selectedProjectId }"
      >
        <button
          type="button"
          class="project-item-main"
          @click="emit('select-project', project.id)"
        >
          <div class="project-item-title">{{ project.name }}</div>
          <div class="project-item-meta">
            <template v-if="workspaceType === 'merge'">
              <span>合并工作区</span>
            </template>
            <template v-else>
              <span>{{ project.documentCount }} 文档</span>
              <span>{{ project.assetCount }} 素材</span>
            </template>
          </div>
        </button>

        <div
          v-if="project.id === selectedProjectId"
          class="project-item-actions"
        >
          <AppButton
            size="sm"
            shape="circle"
            variant="ghost"
            tone="neutral"
            class="project-action-btn"
            title="刷新项目"
            aria-label="刷新项目"
            @click="emit('refresh-project')"
          >
            <template #icon>
              <AppIcon name="refresh" />
            </template>
          </AppButton>
          <AppButton
            size="sm"
            shape="circle"
            variant="ghost"
            tone="neutral"
            class="project-action-btn"
            title="重命名项目"
            aria-label="重命名项目"
            @click="emit('rename-project')"
          >
            <template #icon>
              <AppIcon name="edit" />
            </template>
          </AppButton>
          <AppButton
            size="sm"
            shape="circle"
            variant="ghost"
            tone="danger"
            class="project-action-btn"
            title="删除项目"
            aria-label="删除项目"
            @click="emit('delete-project')"
          >
            <template #icon>
              <AppIcon name="delete" />
            </template>
          </AppButton>
        </div>
      </div>
    </div>
    <AppEmpty v-else description="暂无项目" />
  </aside>
</template>

<script setup>
import AppIcon from '../ui/AppIcon.vue'
import AppButton from '../ui/AppButton.vue'
import AppEmpty from '../ui/AppEmpty.vue'

defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  selectedProjectId: {
    type: String,
    default: ''
  },
  workspaceType: {
    type: String,
    default: 'extract'
  }
})

const emit = defineEmits([
  'create-project',
  'select-project',
  'refresh-project',
  'rename-project',
  'delete-project'
])
</script>

<style lang="scss" scoped>
.project-sidebar {
  background: #fff;
  border: 1px solid #e8edf6;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-height: 680px;
}

.project-sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .project-count {
    font-size: 0.75rem;
    font-weight: 600;
    color: #8b96ab;
  }
}

.project-workbench-switcher {
  background: #f6f9ff;
  border: 1px solid #dfe8f9;
  border-radius: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.3rem;
  padding: 0.34rem;
  width: 100%;
}

.switch-link {
  align-items: center;
  border-radius: 8px;
  color: #72819b;
  display: flex;
  font-size: 0.84rem;
  font-weight: 600;
  justify-content: center;
  min-height: 32px;
  padding: 0.3rem 0.6rem;
  text-decoration: none;
  transition: all 0.18s ease;
}

.switch-link:hover {
  color: #3f79f3;
}

.switch-link.is-active {
  background: #ffffff;
  box-shadow: 0 7px 16px -14px rgba(63, 121, 243, 0.75);
  color: #3f79f3;
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow: auto;
}

.project-item {
  width: 100%;
  border: 1px solid #e8edf6;
  border-radius: 10px;
  background: #fff;
  padding: 0.4rem 0.45rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  transition: all 0.2s ease;
}

.project-item:hover {
  border-color: #bdd0f7;
  background: #f8fbff;
}

.project-item-main {
  border: 0;
  background: transparent;
  width: 100%;
  text-align: left;
  padding: 0.2rem 0.2rem 0.2rem 0.25rem;
  cursor: pointer;
}

.project-item.is-active {
  border-color: #7ea3f7;
  box-shadow: 0 6px 18px -14px rgba(66, 120, 227, 0.72);
  background: #f6f9ff;
}

.project-item-title {
  color: #22314d;
  font-size: 0.88rem;
  font-weight: 600;
}

.project-item-meta {
  margin-top: 0.2rem;
  color: #8995aa;
  font-size: 0.75rem;
  display: flex;
  gap: 0.4rem;
}

.project-item-actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

:deep(.project-action-btn.app-btn.is-sm.is-circle) {
  height: 26px;
  width: 26px;
  border-radius: 8px;
}

@media (max-width: 1100px) {
  .project-sidebar {
    min-height: auto;
  }
}
</style>
