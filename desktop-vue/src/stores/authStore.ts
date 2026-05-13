import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref(localStorage.getItem('userId'))
  const token = ref(localStorage.getItem('token'))
  const isBound = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  async function checkBound() {
    const skipped = localStorage.getItem('wechatBindSkipped') === 'true'
    if (skipped) { isBound.value = true; return true }
    const bound = localStorage.getItem('wechatBound') === 'true'
    isBound.value = bound
    return bound
  }

  function setBound(v: boolean) {
    localStorage.setItem('wechatBound', String(v))
    isBound.value = v
  }

  function setSkipped() {
    localStorage.setItem('wechatBindSkipped', 'true')
    isBound.value = true
  }

  return { userId, token, isBound, isLoggedIn, checkBound, setBound, setSkipped }
})
