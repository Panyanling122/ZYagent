import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('admin_token') || '')
  const user = ref<any>(null)
  const isAdmin = ref(false)

  async function login(username: string, password: string) {
    const res = await axios.post('/api/auth/login', { username, password })
    token.value = res.data.token
    user.value = res.data.user
    isAdmin.value = res.data.user?.is_admin || false
    localStorage.setItem('admin_token', token.value)
    localStorage.setItem('admin_user', JSON.stringify(res.data.user))
    return res.data
  }

  function logout() {
    token.value = ''
    user.value = null
    isAdmin.value = false
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
  }

  function init() {
    const saved = localStorage.getItem('admin_user')
    if (saved) {
      user.value = JSON.parse(saved)
      isAdmin.value = user.value?.is_admin || false
    }
  }

  return { token, user, isAdmin, login, logout, init }
})
