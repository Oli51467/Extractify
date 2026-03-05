import { computed, ref } from 'vue'
import { fetchSessionState, logoutSession } from '../services/projectApi'

const sessionState = ref({
  loaded: false,
  authenticated: false,
  user: null,
  auth: {
    enabled: false,
    providers: {
      google: { enabled: false },
      github: { enabled: false }
    }
  }
})

let refreshPromise = null

const applySessionState = (nextState = {}) => {
  sessionState.value = {
    loaded: true,
    authenticated: Boolean(nextState.authenticated),
    user: nextState.user || null,
    auth: nextState.auth || {
      enabled: false,
      providers: {
        google: { enabled: false },
        github: { enabled: false }
      }
    }
  }
  return sessionState.value
}

const refreshSession = async (force = false) => {
  if (refreshPromise && !force) return refreshPromise

  refreshPromise = fetchSessionState()
    .then((state) => applySessionState(state))
    .catch((error) => {
      sessionState.value = {
        ...sessionState.value,
        loaded: true
      }
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

const signOut = async () => {
  await logoutSession()
  return refreshSession(true)
}

export const useAuthSession = () => {
  const authEnabled = computed(() => Boolean(sessionState.value.auth?.enabled))
  const authenticated = computed(() => {
    if (!authEnabled.value) return true
    return Boolean(sessionState.value.authenticated)
  })
  const user = computed(() => sessionState.value.user || null)
  const authProviders = computed(() => sessionState.value.auth?.providers || {})

  return {
    sessionState,
    authEnabled,
    authenticated,
    user,
    authProviders,
    refreshSession,
    signOut
  }
}
