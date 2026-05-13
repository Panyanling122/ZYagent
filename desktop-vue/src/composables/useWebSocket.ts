import { onMounted, onUnmounted } from 'vue'
import { useChatStore, setGlobalWS } from '@/stores/chatStore'
import { useTaskStore } from '@/stores/taskStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3003/ws'

export function useWebSocket() {
  let ws: WebSocket | null = null
  let reconnectCount = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const chatStore = useChatStore()
  const taskStore = useTaskStore()

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return
    const token = localStorage.getItem('token') || 'demo-token'
    ws = new WebSocket(WS_URL)
    setGlobalWS(ws)

    ws.onopen = () => {
      reconnectCount = 0
      ws?.send(JSON.stringify({ type: 'auth', token }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'reply':
            chatStore.addMessage({
              id: `ws-${Date.now()}`, role: 'assistant', content: msg.content,
              topic: msg.topic, timestamp: new Date().toISOString(),
            })
            if (msg.content?.includes('🟡')) chatStore.togglePanel()
            break
          case 'task_awaiting_human':
            chatStore.addMessage({
              id: `ws-ah-${Date.now()}`, role: 'assistant',
              content: `🟡 任务挂起：${msg.message}`,
              timestamp: new Date().toISOString(),
              awaitingHuman: { taskId: msg.taskId || `task-${Date.now()}`, question: msg.message },
            })
            chatStore.togglePanel()
            break
          case 'task_status_changed': {
            const wsId = localStorage.getItem('currentWorkspaceId')
            if (wsId) taskStore.fetchTasks(wsId)
            break
          }
          case 'auth_success':
            localStorage.setItem('userId', msg.userId)
            if (msg.workspaceId) localStorage.setItem('currentWorkspaceId', msg.workspaceId)
            break
        }
      } catch {
        console.error('[WS] Invalid message:', event.data)
      }
    }

    ws.onclose = () => {
      setGlobalWS(null)
      if (reconnectCount > 20) { console.error('[WS] Max reconnection reached'); return }
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectCount))
      reconnectCount++
      timer = setTimeout(connect, delay)
    }

    ws.onerror = (err) => console.error('[WS] Error:', err)
  }

  onMounted(() => { timer = setTimeout(connect, 0) })
  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    ws?.close()
    setGlobalWS(null)
  })
}
