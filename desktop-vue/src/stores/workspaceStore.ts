import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { Workspace } from '@/types'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<Workspace[]>([])
  const currentId = ref(localStorage.getItem('currentWorkspaceId') || '')
  const isLoading = ref(false)

  async function fetchWorkspaces() {
    isLoading.value = true
    try {
      const data = await api.workspaces.list()
      workspaces.value = data.workspaces || []
      if (workspaces.value.length && !currentId.value) {
        setCurrent(workspaces.value[0].id)
      }
    } catch (err) {
      console.error('[Workspace] fetch failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  function setCurrent(id: string) {
    localStorage.setItem('currentWorkspaceId', id)
    currentId.value = id
  }

  async function switchWorkspace(id: string) {
    await api.workspaces.switch(id)
    setCurrent(id)
  }

  return { workspaces, currentId, isLoading, fetchWorkspaces, setCurrent, switchWorkspace }
})
