import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useAdminStore = defineStore('admin', () => {
  const stats = ref({ users: 0, tasks: 0, souls: 0, messages: 0, workspaces: 0 })
  const tokenUsage = ref({ daily: 0, monthly: 0, total: 0 })
  const loading = ref(false)

  async function fetchStats() {
    loading.value = true
    try {
      const [dash, tu] = await Promise.all([
        axios.get('/api/admin/dashboard').then(r => r.data).catch(() => ({} as any)),
        axios.get('/api/admin/token-stats').then(r => r.data).catch(() => ({} as any)),
      ])
      stats.value = {
        users: dash.totalUsers || 0,
        tasks: dash.totalTasks || 0,
        souls: dash.totalSouls || 0,
        messages: dash.totalMessages || 0,
        workspaces: dash.totalWorkspaces || 0,
      }
      tokenUsage.value = {
        daily: tu.daily || 0,
        monthly: tu.monthly || 0,
        total: tu.total || 0,
      }
    } finally {
      loading.value = false
    }
  }

  return { stats, tokenUsage, loading, fetchStats }
})
