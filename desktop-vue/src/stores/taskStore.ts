import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { Task, TaskStatus } from '@/types'

const DEV_FALLBACK: Task[] = [
  { id: 't1', title: '客户报价确认', status: 'awaiting_human', priority: 'p0', type: 'mixed', awaiting_response: '涉及金额审批，请选择', created_at: new Date().toISOString() },
  { id: 't2', title: 'Q3 报表生成', status: 'in_progress', priority: 'p1', type: 'ai_task', created_at: new Date().toISOString() },
  { id: 't3', title: '产品需求文档', status: 'backlog', priority: 'p2', type: 'human_task', created_at: new Date().toISOString() },
  { id: 't4', title: '数据清洗', status: 'todo', priority: 'p1', type: 'ai_task', created_at: new Date().toISOString() },
]

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const isLoading = ref(false)

  async function fetchTasks(workspaceId?: string) {
    const wsId = workspaceId || localStorage.getItem('currentWorkspaceId') || ''
    if (!wsId) return
    isLoading.value = true
    try {
      const data = await api.tasks.list({ workspace_id: wsId })
      tasks.value = data.tasks || []
    } catch {
      if (import.meta.env.DEV) tasks.value = DEV_FALLBACK
    } finally {
      isLoading.value = false
    }
  }

  async function moveTask(taskId: string, newStatus: TaskStatus) {
    const prev = tasks.value.find(t => t.id === taskId)
    tasks.value = tasks.value.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
    try {
      await api.tasks.updateStatus(taskId, newStatus, 'Dragged on kanban')
    } catch (e) {
      console.error('Move task failed:', e)
      if (prev) tasks.value = tasks.value.map(t => t.id === taskId ? prev : t)
    }
  }

  async function createTask(data: Partial<Task>) {
    const wsId = localStorage.getItem('currentWorkspaceId') || ''
    const userId = localStorage.getItem('userId') || 'demo-user'
    const res = await api.tasks.create({ ...data, workspace_id: wsId, created_by: userId, assigned_to: userId })
    tasks.value.push(res)
  }

  return { tasks, isLoading, fetchTasks, moveTask, createTask }
})
