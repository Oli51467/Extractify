import { reactive, readonly } from 'vue'

const state = reactive({
  visible: false,
  mode: 'confirm',
  title: '',
  message: '',
  inputValue: '',
  confirmText: '确定',
  cancelText: '取消',
  _resolver: null
})

const closeDialog = (payload) => {
  if (typeof state._resolver === 'function') {
    state._resolver(payload)
  }

  state.visible = false
  state.mode = 'confirm'
  state.title = ''
  state.message = ''
  state.inputValue = ''
  state.confirmText = '确定'
  state.cancelText = '取消'
  state._resolver = null
}

export const openConfirmDialog = ({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消'
} = {}) => new Promise((resolve) => {
  state.visible = true
  state.mode = 'confirm'
  state.title = title
  state.message = message
  state.confirmText = confirmText
  state.cancelText = cancelText
  state._resolver = resolve
})

export const openPromptDialog = ({
  title = '请输入',
  message = '',
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消'
} = {}) => new Promise((resolve) => {
  state.visible = true
  state.mode = 'prompt'
  state.title = title
  state.message = message
  state.inputValue = defaultValue
  state.confirmText = confirmText
  state.cancelText = cancelText
  state._resolver = resolve
})

export const dialogActions = {
  setInputValue(value) {
    state.inputValue = value
  },
  confirm() {
    if (state.mode === 'prompt') {
      closeDialog({ confirmed: true, value: state.inputValue })
      return
    }

    closeDialog({ confirmed: true })
  },
  cancel() {
    if (state.mode === 'prompt') {
      closeDialog({ confirmed: false, value: '' })
      return
    }

    closeDialog({ confirmed: false })
  }
}

export const useDialogStore = () => readonly(state)
