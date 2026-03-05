<template>
  <div class="workspace" :class="{ 'is-single-pane': !showSidebar }">
    <ProjectSidebar
      v-if="showSidebar"
      :projects="projects"
      :selected-project-id="selectedProjectId"
      :workspace-type="workspaceType"
      @create-project="createProjectFromInput"
      @select-project="handleSelectProject"
      @refresh-project="refreshCurrentProject"
      @rename-project="renameCurrentProject"
      @delete-project="deleteCurrentProject"
    />

    <section class="workspace-main" :class="{ 'is-contained-pane': !isExtractWorkbench }">
      <div v-if="showWorkspaceToolbar" class="workspace-toolbar">
        <label class="workspace-project-switcher">
          <span class="workspace-switcher-label">当前项目</span>
          <select
            v-model="selectedProjectId"
            class="workspace-switcher-select"
            :disabled="projects.length === 0"
          >
            <option v-if="projects.length === 0" value="" disabled>
              暂无项目
            </option>
            <option
              v-for="project in projects"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </option>
          </select>
        </label>
      </div>
      <template v-if="isMergifyWorkbench">
        <AppCard class="merge-workbench-card">
          <template #header>
            <div class="merge-workbench-header">
              <div class="merge-workbench-title">文档合并</div>
              <label class="merge-workbench-asset-target">
                <span class="merge-workbench-asset-label">素材库项目</span>
                <select
                  v-model="mergeAssetProjectId"
                  class="merge-workbench-asset-select"
                  :disabled="mergeAssetProjects.length === 0"
                >
                  <option v-if="mergeAssetProjects.length === 0" value="" disabled>
                    暂无 Extract 项目
                  </option>
                  <option
                    v-for="project in mergeAssetProjects"
                    :key="project.id"
                    :value="project.id"
                  >
                    {{ project.name }}
                  </option>
                </select>
              </label>
            </div>
          </template>
          <ImageMerger :asset-project-id="mergeAssetProjectId" />
        </AppCard>
      </template>
      <template v-else>
        <template v-if="selectedProject">
          <DocumentsTab
            v-if="isExtractWorkbench"
            :project-id="selectedProject.id"
            :project-documents="projectDocuments"
            @upload-finished="handleSingleExtracted"
            @delete-document="handleDeleteDocument"
          />

          <AssetsTab
            v-else-if="isAssetsWorkbench"
            :project-id="selectedProject.id"
            :gallery-images="galleryImages"
            :zip-urls="zipUrls"
          />

          <HistoryTab
            v-else-if="isHistoryWorkbench"
            :project-runs="projectRuns"
            :project-batches="projectBatches"
            :expanded-batch-id="expandedBatchId"
            :expanded-batch-items="expandedBatchItems"
            @toggle-detail="toggleBatchDetail"
            @retry-batch="retryBatchFailed"
            @cancel-batch="cancelBatchQueued"
          />
        </template>

        <div v-else class="project-empty">
          <AppEmpty description="请先创建或选择项目" />
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectWorkspace } from '../composables/useProjectWorkspace'
import { fetchProjects as fetchWorkspaceProjects } from '../services/projectApi'
import ProjectSidebar from '../components/workspace/ProjectSidebar.vue'
import DocumentsTab from '../components/workspace/DocumentsTab.vue'
import AssetsTab from '../components/workspace/AssetsTab.vue'
import HistoryTab from '../components/workspace/HistoryTab.vue'
import ImageMerger from '../components/ImageMerger.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppEmpty from '../components/ui/AppEmpty.vue'

const route = useRoute()
const workspaceType = computed(() => route.name === 'DocPixMerge' ? 'merge' : 'extract')

const {
  projects,
  selectedProjectId,
  selectedProject,
  projectDocuments,
  projectRuns,
  projectBatches,
  galleryImages,
  zipUrls,
  expandedBatchId,
  expandedBatchItems,
  createProjectFromInput,
  renameCurrentProject,
  deleteCurrentProject,
  refreshCurrentProject,
  toggleBatchDetail,
  retryBatchFailed,
  cancelBatchQueued,
  handleSingleExtracted,
  handleDeleteDocument
} = useProjectWorkspace(workspaceType)

const isMergifyWorkbench = computed(() => route.name === 'DocPixMerge')
const isAssetsWorkbench = computed(() => route.name === 'DocPixAssets')
const isHistoryWorkbench = computed(() => route.name === 'DocPixHistory')
const isExtractWorkbench = computed(
  () => !isMergifyWorkbench.value && !isAssetsWorkbench.value && !isHistoryWorkbench.value
)
const showSidebar = computed(() => isExtractWorkbench.value)
const showWorkspaceToolbar = computed(() => !isExtractWorkbench.value)
const mergeAssetProjects = ref([])
const mergeAssetProjectId = ref('')

const loadMergeAssetProjects = async () => {
  try {
    const projects = await fetchWorkspaceProjects('extract')
    mergeAssetProjects.value = projects
    const hasSelected = projects.some((project) => project.id === mergeAssetProjectId.value)
    if (!hasSelected) {
      mergeAssetProjectId.value = projects[0]?.id || ''
    }
  } catch (error) {
    mergeAssetProjects.value = []
    mergeAssetProjectId.value = ''
  }
}

watch(
  isMergifyWorkbench,
  (active) => {
    if (!active) return
    loadMergeAssetProjects()
  },
  { immediate: true }
)

const handleSelectProject = (projectId) => {
  selectedProjectId.value = projectId
}
</script>

<style lang="scss" scoped>
.workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 1rem;
}

.workspace.is-single-pane {
  grid-template-columns: minmax(0, 1fr);
}

.workspace-main {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.workspace-main.is-contained-pane {
  margin: 0 auto;
  max-width: 1160px;
  width: 100%;
}

.workspace-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  justify-content: space-between;
}

.workspace-project-switcher {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.workspace-switcher-label {
  color: #7d8aa2;
  font-size: 0.78rem;
  font-weight: 600;
}

.workspace-switcher-select {
  background: #fff;
  border: 1px solid #d8e2f5;
  border-radius: 10px;
  color: #465a7e;
  font-size: 0.8rem;
  font-weight: 600;
  min-height: 34px;
  min-width: 180px;
  padding: 0 0.7rem;
}

.workspace-switcher-select:disabled {
  color: #9aa7bd;
}

.merge-workbench-card {
  width: 100%;
}

.merge-workbench-header {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: space-between;
}

.merge-workbench-title {
  color: #2d3b56;
  font-size: 0.96rem;
  font-weight: 600;
}

.merge-workbench-asset-target {
  align-items: center;
  display: inline-flex;
  gap: 0.4rem;
}

.merge-workbench-asset-label {
  color: #6f7e97;
  font-size: 0.75rem;
  font-weight: 600;
}

.merge-workbench-asset-select {
  background: #fff;
  border: 1px solid #d8e2f5;
  border-radius: 10px;
  color: #465a7e;
  font-size: 0.78rem;
  font-weight: 600;
  min-height: 32px;
  min-width: 180px;
  padding: 0 0.62rem;
}

.project-empty {
  min-height: 420px;
  border: 1px dashed #d6e0f2;
  border-radius: 12px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 1fr;
  }
}
</style>
