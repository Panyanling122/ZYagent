import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import type { ChatMessage } from '@/types'

let globalWs: WebSocket | null = null

export function setGlobalWS(ws: WebSocket | null) { globalWs = ws }

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isMinimized = ref(true)
  const unread = ref(0)

  function addMessage(msg: ChatMessage) {
    messages.value.push(msg)
    if (msg.role === 'assistant' && isMinimized.value) unread.value++
  }

  function togglePanel() {
    isMinimized.value = !isMinimized.value
    if (!isMinimized.value) unread.value = 0
  }

  function minimize() { isMinimized.value = true }

  function sendViaWS(content: string) {
    if (globalWs?.readyState === WebSocket.OPEN) {
      const soulId = localStorage.getItem('subscribedSoulId') || ''
      globalWs.send(JSON.stringify({ type: 'message', content, soulId }))
    }
    addMessage({ id: `msg-${Date.now()}`, role: 'user', content, timestamp: new Date().toISOString() })
    isMinimized.value = false
  }

  async function respondToTask(taskId: string, response: string) {
    try {
      const valueMap: Record<string, string> = { '同意': 'approve', '拒绝': 'reject', '修改': 'modify' }
      const machineValue = valueMap[response] || response
      await api.tasks.updateStatus(taskId, 'in_progress', `Human ${machineValue}`)
      addMessage({ id: `msg-${Date.now()}`, role: 'assistant', content: `已${response}，任务已恢复进行`, timestamp: new Date().toISOString() })
    } catch (e) {
      console.error('Respond to task failed:', e)
    }
  }

  return { messages, isMinimized, unread, addMessage, togglePanel, minimize, sendViaWS, respondToTask }
})
