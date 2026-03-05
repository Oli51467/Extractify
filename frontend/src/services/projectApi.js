const defaultHeaders = {
  'X-Requested-With': 'XMLHttpRequest'
}

export const apiFetch = async (url, options = {}) => {
  let response
  try {
    response = await fetch(url, {
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      },
      ...options
    })
  } catch (error) {
    throw new Error('无法连接后端服务，请确认 backend 已启动且端口与前端代理一致')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) {
    if (response.status === 500 && String(url).startsWith('/api/session')) {
      throw new Error('后端会话接口异常，请检查 backend 日志或 CORS 配置')
    }
    throw new Error(data.message || `请求失败 (${response.status})`)
  }
  return data
}

const normalizeSessionState = (payload = {}) => {
  const auth = payload?.auth && typeof payload.auth === 'object'
    ? payload.auth
    : { enabled: false, providers: {} }

  return {
    authenticated: Boolean(payload?.authenticated),
    user: payload?.user || null,
    auth: {
      enabled: Boolean(auth.enabled),
      providers: {
        google: {
          enabled: Boolean(auth?.providers?.google?.enabled)
        },
        github: {
          enabled: Boolean(auth?.providers?.github?.enabled)
        }
      }
    }
  }
}

export const fetchSessionState = async () => {
  const data = await apiFetch('/api/session')
  return normalizeSessionState(data || {})
}

export const ensureSessionReady = async (options = {}) => {
  const requireAuth = Object.prototype.hasOwnProperty.call(options, 'requireAuth')
    ? Boolean(options.requireAuth)
    : true
  const session = await fetchSessionState()

  if (requireAuth && session.auth.enabled && !session.authenticated) {
    throw new Error('请先登录后再继续')
  }

  return session
}

export const startOAuthLogin = (provider, redirectPath = '/') => {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const safeRedirect = String(redirectPath || '').trim()
  if (!normalizedProvider) return

  const query = new URLSearchParams()
  if (safeRedirect.startsWith('/')) {
    query.set('redirect', safeRedirect)
  } else {
    query.set('redirect', '/')
  }

  const target = `/api/auth/${encodeURIComponent(normalizedProvider)}/start?${query.toString()}`
  window.location.assign(target)
}

export const logoutSession = () => apiFetch('/api/auth/logout', { method: 'POST' })

export const fetchShareDetail = async (token) => {
  const safeToken = encodeURIComponent(String(token || '').trim())
  if (!safeToken) {
    throw new Error('无效的分享标识')
  }
  const data = await apiFetch(`/api/share/${safeToken}`)
  return data.share
}

export const fetchProjects = async (workspaceType = 'extract') => {
  const query = workspaceType ? `?workspaceType=${encodeURIComponent(workspaceType)}` : ''
  const data = await apiFetch(`/api/projects${query}`)
  return data.projects || []
}

export const createProject = async (payload = {}, workspaceType = 'extract') => {
  const data = await apiFetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...payload,
      workspaceType
    })
  })
  return data.project
}

export const updateProject = async (projectId, payload = {}) => {
  const data = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  return data.project
}

export const removeProject = (projectId) => {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  })
}

export const fetchProjectDocuments = async (projectId, limit = 200) => {
  const data = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/documents?limit=${limit}`)
  return data.documents || []
}

export const removeProjectDocument = async (projectId, documentId) => {
  const data = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' }
  )
  return data.cleanup || null
}

export const fetchProjectAssets = async (projectId, limit = 500) => {
  const data = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/assets?limit=${limit}`)
  return data.assets || []
}

export const updateProjectAssetOcr = async (projectId, assetId, payload = {}) => {
  const data = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/ocr`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    }
  )
  return data.asset || null
}

export const uploadMergedImageToAssetLibrary = async (projectId, fileBlob, fileName = 'merged.png') => {
  const formData = new FormData()
  formData.append('file', fileBlob, fileName)
  const data = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/assets/merged-image`,
    {
      method: 'POST',
      body: formData
    }
  )
  return {
    asset: data.asset || null,
    runId: data.runId || '',
    message: data.message || ''
  }
}

export const fetchProjectRuns = async (projectId, limit = 200) => {
  const data = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/runs?limit=${limit}`)
  return data.runs || []
}

export const fetchProjectBatches = async (projectId, limit = 200) => {
  const data = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/batches?limit=${limit}`)
  return data.batches || []
}

export const fetchBatchDetail = (projectId, batchId) => {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}`)
}

export const createBatch = (projectId, formData) => {
  return apiFetch(`/api/projects/${encodeURIComponent(projectId)}/batches/extract-images`, {
    method: 'POST',
    body: formData
  })
}

export const retryBatch = (projectId, batchId) => {
  return apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/retry-failed`,
    { method: 'POST' }
  )
}

export const cancelBatch = (projectId, batchId) => {
  return apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/batches/${encodeURIComponent(batchId)}/cancel`,
    { method: 'POST' }
  )
}
