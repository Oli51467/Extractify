import { reactive, readonly } from 'vue'

const MAX_TOASTS = 4
const DEFAULT_DURATION = 2800

const state = reactive({
  items: []
})

let nextId = 1

const dismissToast = (id) => {
  state.items = state.items.filter((item) => item.id !== id)
}

const pushToast = (type, message, duration = DEFAULT_DURATION) => {
  const text = String(message || '').trim()
  if (!text) return null

  const id = nextId++
  state.items = [
    ...state.items,
    {
      id,
      type,
      message: text
    }
  ].slice(-MAX_TOASTS)

  if (duration > 0) {
    window.setTimeout(() => {
      dismissToast(id)
    }, duration)
  }

  return id
}

export const notify = {
  success: (message, duration) => pushToast('success', message, duration),
  error: (message, duration) => pushToast('error', message, duration),
  warning: (message, duration) => pushToast('warning', message, duration),
  info: (message, duration) => pushToast('info', message, duration),
  dismiss: dismissToast
}

export const useNotifyStore = () => readonly(state)
