<template>
  <div class="workspace">
    <ProjectSidebar
      :projects="projects"
      :selected-project-id="selectedProjectId"
      :workspace-type="workspaceType"
      @create-project="createProjectFromInput"
      @select-project="handleSelectProject"
      @refresh-project="refreshCurrentProject"
      @rename-project="renameCurrentProject"
      @delete-project="deleteCurrentProject"
    />

    <section class="workspace-main">
      <template v-if="isMergifyWorkbench">
        <AppCard class="merge-workbench-card">
          <template #header>
            <div class="merge-workbench-header">
              <div class="merge-workbench-title">文档合并</div>
              <AppButton
                size="sm"
                variant="outline"
                tone="neutral"
                @click="handleImportFromExtractProject"
              >
                <template #icon>
                  <AppIcon name="upload" />
                </template>
                Import from Extract
              </AppButton>
            </div>
          </template>
          <ImageMerger ref="imageMergerRef" />
        </AppCard>
      </template>
      <template v-else>
        <WorkspaceTabs
          v-if="selectedProject"
          :tabs="tabs"
          v-model:active-tab="activeTab"
        />

        <template v-if="selectedProject">
          <DocumentsTab
            v-if="activeTab === 'documents'"
            :project-id="selectedProject.id"
            :project-documents="projectDocuments"
            @upload-finished="handleSingleExtracted"
          />

          <AssetsTab
            v-else-if="activeTab === 'assets'"
            :project-id="selectedProject.id"
            :gallery-images="galleryImages"
            :zip-urls="zipUrls"
          />

          <HistoryTab
            v-else-if="activeTab === 'history'"
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
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectWorkspace } from '../composables/useProjectWorkspace'
import { fetchProjects as fetchWorkspaceProjects, fetchProjectAssets } from '../services/projectApi'
import { notify } from '../services/notify'
import { openPromptDialog } from '../services/dialog'
import ProjectSidebar from '../components/workspace/ProjectSidebar.vue'
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue'
import DocumentsTab from '../components/workspace/DocumentsTab.vue'
import AssetsTab from '../components/workspace/AssetsTab.vue'
import HistoryTab from '../components/workspace/HistoryTab.vue'
import ImageMerger from '../components/ImageMerger.vue'
import AppCard from '../components/ui/AppCard.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import AppEmpty from '../components/ui/AppEmpty.vue'

const route = useRoute()
const workspaceType = computed(() => route.path === '/mergify' ? 'merge' : 'extract')
const imageMergerRef = ref(null)

const {
  tabs,
  projects,
  selectedProjectId,
  selectedProject,
  activeTab,
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
  handleSingleExtracted
} = useProjectWorkspace(workspaceType)

const isMergifyWorkbench = computed(() => route.path === '/mergify')

const handleImportFromExtractProject = async () => {
  try {
    const extractProjects = await fetchWorkspaceProjects('extract')
    if (!extractProjects.length) {
      notify.warning('暂无可导入素材的解析项目')
      return
    }

    let sourceProject = extractProjects[0]
    if (extractProjects.length > 1) {
      const candidateList = extractProjects.slice(0, 12)
      const message = `Enter the extract project index to import: ${candidateList
        .map((project, index) => `${index + 1}. ${project.name}`)
        .join(' ｜ ')}`

      const result = await openPromptDialog({
        title: 'Import Extract Assets',
        message,
        defaultValue: '1',
        confirmText: 'Import'
      })
      if (!result?.confirmed) return

      const selectedIndex = Number(result.value) - 1
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= candidateList.length) {
        notify.warning('输入的序号无效')
        return
      }
      sourceProject = candidateList[selectedIndex]
    }

    const assets = await fetchProjectAssets(sourceProject.id, 1000)
    const imported = imageMergerRef.value?.appendRemoteImages(
      assets
        .filter((asset) => asset?.path)
        .map((asset) => ({
          name: asset.name || 'imported_image',
          url: asset.path
        }))
    ) || 0

    if (imported > 0) {
      notify.success(`已从「${sourceProject.name}」导入 ${imported} 张素材`)
    } else {
      notify.warning('该项目暂无可导入素材')
    }
  } catch (error) {
    notify.error(error.message || '导入解析素材失败')
  }
}

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

.workspace-main {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
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
