import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { notify } from '../services/notify'
import { openConfirmDialog, openPromptDialog } from '../services/dialog'
import {
  ensureSessionReady,
  fetchProjects,
  createProject,
  updateProject,
  removeProject,
  fetchProjectDocuments,
  removeProjectDocument,
  fetchProjectAssets,
  fetchProjectRuns,
  fetchProjectBatches,
  fetchBatchDetail,
  createBatch,
  retryBatch,
  cancelBatch
} from '../services/projectApi'

export const workspaceTabs = [
  { key: 'documents', label: '文档' },
  { key: 'assets', label: '素材' },
  { key: 'history', label: '历史' }
]

const normalizeWorkspaceType = (value) => String(value || '').trim().toLowerCase() === 'merge' ? 'merge' : 'extract'

export const useProjectWorkspace = (workspaceTypeRef = null) => {
  const projects = ref([])
  const selectedProjectId = ref('')
  const activeTab = ref('documents')
  const selectedProjectByType = ref({
    extract: '',
    merge: ''
  })

  const projectDocuments = ref([])
  const projectAssets = ref([])
  const projectRuns = ref([])
  const projectBatches = ref([])

  const selectedBatchFiles = ref([])
  const batchFileInputKey = ref(0)
  const batchDedupeEnabled = ref(true)
  const batchSubmitting = ref(false)

  const expandedBatchId = ref('')
  const expandedBatchItems = ref([])

  const selectedProject = computed(() => projects.value.find((item) => item.id === selectedProjectId.value) || null)

  const galleryImages = computed(() => projectAssets.value.map((asset, index) => ({
    id: asset.id || `${asset.runId}_${index}`,
    runId: asset.runId || '',
    jobId: asset.jobId || '',
    documentId: asset.documentId || asset.sourceContext?.documentId || '',
    name: asset.name,
    path: asset.path,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    page: asset.page,
    sourceFileType: asset.fileType || asset.sourceContext?.fileType || '',
    source: asset.sourceContext?.sourceName || '',
    semanticCategory: asset.semanticCategory || asset.sourceContext?.semanticCategory || '',
    semanticConfidence: Number(asset.semanticConfidence || asset.sourceContext?.semanticConfidence || 0),
    ocrIndexed: Boolean(asset.ocrIndexed),
    ocrText: asset.ocrText || ''
  })))

  const zipUrls = computed(() => {
    return projectRuns.value
      .filter((run) => run?.result?.zipUrl)
      .map((run, index) => ({
        url: run.result.zipUrl,
        name: run.sourceName || `任务 ${index + 1}`,
        count: Number(run.result.imageCount || 0),
        runId: run.id || '',
        jobId: run.jobId || '',
        fileName: `${(run.sourceName || `images_${index + 1}`).replace(/[\\/:*?"<>|]/g, '_')}.zip`
      }))
  })

  let pollTimer = null
  const pollBusy = ref(false)
  const hadActiveBatch = ref(false)
  const currentWorkspaceType = computed(() => normalizeWorkspaceType(workspaceTypeRef?.value || workspaceTypeRef || 'extract'))

  const isExtractWorkspace = computed(() => currentWorkspaceType.value === 'extract')

  const loadProjects = async () => {
    projects.value = await fetchProjects(currentWorkspaceType.value)
  }

  const createDefaultProjectIfNeeded = async () => {
    if (projects.value.length > 0) return
    const defaultName = isExtractWorkspace.value ? 'Extractify' : 'Mergify'
    const project = await createProject({ name: defaultName }, currentWorkspaceType.value)
    projects.value = [project]
    selectedProjectId.value = project.id
  }

  const loadProjectDocuments = async (projectId) => {
    projectDocuments.value = await fetchProjectDocuments(projectId)
  }

  const loadProjectAssets = async (projectId) => {
    projectAssets.value = await fetchProjectAssets(projectId)
  }

  const loadProjectRuns = async (projectId) => {
    projectRuns.value = await fetchProjectRuns(projectId)
  }

  const loadProjectBatches = async (projectId) => {
    projectBatches.value = await fetchProjectBatches(projectId)
  }

  const loadProjectData = async (projectId) => {
    if (!projectId) return
    if (!isExtractWorkspace.value) {
      resetProjectCollections()
      return
    }
    await Promise.all([
      loadProjectDocuments(projectId),
      loadProjectAssets(projectId),
      loadProjectRuns(projectId),
      loadProjectBatches(projectId)
    ])
  }

  const createProjectFromInput = async () => {
    const fallbackName = `${isExtractWorkspace.value ? 'Extractify' : 'Mergify'} ${projects.value.length + 1}`
    const result = await openPromptDialog({
      title: 'Create Project',
      message: 'Enter a project name',
      defaultValue: fallbackName,
      confirmText: 'Create'
    })
    if (!result?.confirmed) return

    const name = String(result.value || '').trim()
    if (!name) {
      notify.warning('项目名称不能为空')
      return
    }

    try {
      const project = await createProject({ name }, currentWorkspaceType.value)
      projects.value = [project, ...projects.value]
      selectedProjectId.value = project.id
      notify.success('项目创建成功')
    } catch (error) {
      notify.error(error.message)
    }
  }

  const renameCurrentProject = async () => {
    if (!selectedProject.value) return
    const result = await openPromptDialog({
      title: '重命名项目',
      message: '请输入新的项目名称',
      defaultValue: selectedProject.value.name || ''
    })
    if (!result?.confirmed) return

    const nextName = String(result.value || '').trim()
    if (!nextName) {
      notify.warning('项目名称不能为空')
      return
    }

    try {
      const updated = await updateProject(selectedProject.value.id, { name: nextName })
      projects.value = projects.value.map((item) => item.id === updated.id ? updated : item)
      notify.success('项目已重命名')
    } catch (error) {
      notify.error(error.message || '重命名失败')
    }
  }

  const resetProjectCollections = () => {
    projectDocuments.value = []
    projectAssets.value = []
    projectRuns.value = []
    projectBatches.value = []
    expandedBatchId.value = ''
    expandedBatchItems.value = []
  }

  const deleteCurrentProject = async () => {
    if (!selectedProject.value) return
    const result = await openConfirmDialog({
      title: '删除确认',
      message: `确认删除项目「${selectedProject.value.name}」吗？`,
      confirmText: '删除',
      cancelText: '取消'
    })
    if (!result?.confirmed) return

    try {
      const deletingId = selectedProject.value.id
      await removeProject(deletingId)
      projects.value = projects.value.filter((item) => item.id !== deletingId)
      selectedProjectId.value = projects.value[0]?.id || ''

      if (!selectedProjectId.value) {
        resetProjectCollections()
      }
      notify.success('项目已删除')
    } catch (error) {
      notify.error(error.message || '删除项目失败')
    }
  }

  const refreshCurrentProject = async (silent = false) => {
    if (!selectedProjectId.value) return
    try {
      if (isExtractWorkspace.value) {
        await Promise.all([
          loadProjectData(selectedProjectId.value),
          loadProjects()
        ])
      } else {
        await loadProjects()
      }
      if (!silent) notify.success('已刷新项目数据')
    } catch (error) {
      notify.error(error.message)
    }
  }

  const handleSingleExtracted = async () => {
    if (!selectedProjectId.value) return
    if (!isExtractWorkspace.value) return
    await Promise.all([
      loadProjectData(selectedProjectId.value),
      loadProjects()
    ])
  }

  const handleDeleteDocument = async (documentItem) => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value) return

    const documentId = String(documentItem?.id || '').trim()
    if (!documentId) return
    const documentName = String(documentItem?.sourceName || documentItem?.originalFilename || '未命名文档').trim()

    const result = await openConfirmDialog({
      title: '删除文档',
      message: `确认删除「${documentName}」吗？将同步清理该文档提取的图片与产物。`,
      confirmText: '删除',
      cancelText: '取消'
    })
    if (!result?.confirmed) return

    try {
      const cleanup = await removeProjectDocument(selectedProjectId.value, documentId)
      await Promise.all([
        loadProjectData(selectedProjectId.value),
        loadProjects()
      ])

      const cleaned = Number(cleanup?.removedAssetCount || 0)
      if (cleaned > 0) {
        notify.success(`文档已删除，并清理 ${cleaned} 张提取图片`)
      } else {
        notify.success('文档已删除')
      }
    } catch (error) {
      notify.error(error.message || '删除文档失败')
    }
  }

  const setBatchFiles = (files) => {
    selectedBatchFiles.value = Array.isArray(files) ? files : []
  }

  const clearBatchFiles = () => {
    selectedBatchFiles.value = []
    batchFileInputKey.value += 1
  }

  const submitBatch = async () => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value) return
    if (selectedBatchFiles.value.length === 0) {
      notify.warning('请先选择文档文件')
      return
    }

    batchSubmitting.value = true
    try {
      const formData = new FormData()
      selectedBatchFiles.value.forEach((file) => {
        formData.append('files', file)
      })
      formData.append('dedupe', batchDedupeEnabled.value ? '1' : '0')
      formData.append('name', `批处理 ${new Date().toLocaleString()}`)

      await createBatch(selectedProjectId.value, formData)
      clearBatchFiles()
      await Promise.all([
        loadProjectBatches(selectedProjectId.value),
        loadProjects()
      ])
      notify.success('批量任务已提交')
    } catch (error) {
      notify.error(error.message)
    } finally {
      batchSubmitting.value = false
    }
  }

  const toggleBatchDetail = async (batchId) => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value) return
    if (expandedBatchId.value === batchId) {
      expandedBatchId.value = ''
      expandedBatchItems.value = []
      return
    }

    try {
      const detail = await fetchBatchDetail(selectedProjectId.value, batchId)
      expandedBatchId.value = batchId
      expandedBatchItems.value = detail.items || []
    } catch (error) {
      notify.error(error.message)
    }
  }

  const retryBatchFailed = async (batchId) => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value) return
    try {
      const data = await retryBatch(selectedProjectId.value, batchId)
      await loadProjectBatches(selectedProjectId.value)
      notify.success(`已重新提交 ${data.retriedCount || 0} 个失败项`)
    } catch (error) {
      notify.error(error.message)
    }
  }

  const cancelBatchQueued = async (batchId) => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value) return
    try {
      const data = await cancelBatch(selectedProjectId.value, batchId)
      await loadProjectBatches(selectedProjectId.value)
      notify.success(`已取消 ${data.cancelledCount || 0} 个排队项`)
    } catch (error) {
      notify.error(error.message)
    }
  }

  const pollProject = async () => {
    if (!isExtractWorkspace.value) return
    if (!selectedProjectId.value || pollBusy.value) return

    pollBusy.value = true
    try {
      await loadProjectBatches(selectedProjectId.value)
      const hasActive = projectBatches.value.some((batch) => ['queued', 'processing'].includes(batch.status))

      if (hasActive || hadActiveBatch.value) {
        await Promise.all([
          loadProjectRuns(selectedProjectId.value),
          loadProjectAssets(selectedProjectId.value),
          loadProjectDocuments(selectedProjectId.value),
          loadProjects()
        ])
      }
      hadActiveBatch.value = hasActive

      if (expandedBatchId.value) {
        const detail = await fetchBatchDetail(selectedProjectId.value, expandedBatchId.value)
        expandedBatchItems.value = detail.items || []
      }
    } catch (error) {
      // ignore polling failures
    } finally {
      pollBusy.value = false
    }
  }

  const startPolling = () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(pollProject, 2500)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  watch(selectedProjectId, async (projectId) => {
    selectedProjectByType.value[currentWorkspaceType.value] = projectId || ''
    expandedBatchId.value = ''
    expandedBatchItems.value = []
    hadActiveBatch.value = false
    if (!projectId) return

    try {
      if (isExtractWorkspace.value) {
        await loadProjectData(projectId)
      } else {
        resetProjectCollections()
      }
    } catch (error) {
      notify.error(error.message)
    }
  })

  const bootstrapWorkspace = async () => {
    await loadProjects()
    await createDefaultProjectIfNeeded()

    const rememberedId = selectedProjectByType.value[currentWorkspaceType.value]
    if (rememberedId && projects.value.some((item) => item.id === rememberedId)) {
      selectedProjectId.value = rememberedId
    } else if (!selectedProjectId.value && projects.value.length > 0) {
      selectedProjectId.value = projects.value[0].id
    } else if (selectedProjectId.value && !projects.value.some((item) => item.id === selectedProjectId.value)) {
      selectedProjectId.value = projects.value[0]?.id || ''
    }

    if (isExtractWorkspace.value && selectedProjectId.value) {
      await loadProjectData(selectedProjectId.value)
    } else {
      resetProjectCollections()
    }
  }

  watch(currentWorkspaceType, async (nextType, prevType) => {
    if (nextType === prevType) return
    try {
      hadActiveBatch.value = false
      expandedBatchId.value = ''
      expandedBatchItems.value = []
      selectedProjectId.value = ''
      await bootstrapWorkspace()
    } catch (error) {
      notify.error(error.message || '切换工作台失败')
    }
  })

  onMounted(async () => {
    try {
      await ensureSessionReady()
      await bootstrapWorkspace()
      startPolling()
    } catch (error) {
      notify.error(error.message || '初始化失败')
    }
  })

  onUnmounted(() => {
    stopPolling()
  })

  return {
    tabs: workspaceTabs,
    workspaceType: currentWorkspaceType,
    projects,
    selectedProjectId,
    selectedProject,
    activeTab,
    projectDocuments,
    projectRuns,
    projectBatches,
    galleryImages,
    zipUrls,
    selectedBatchFiles,
    selectedBatchFileCount: computed(() => selectedBatchFiles.value.length),
    batchFileInputKey,
    batchDedupeEnabled,
    batchSubmitting,
    expandedBatchId,
    expandedBatchItems,
    createProjectFromInput,
    renameCurrentProject,
    deleteCurrentProject,
    refreshCurrentProject,
    setBatchFiles,
    submitBatch,
    toggleBatchDetail,
    retryBatchFailed,
    cancelBatchQueued,
    handleSingleExtracted,
    handleDeleteDocument
  }
}
