export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled' | 'awaiting_human'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: string
  type: string
  soul_id?: string
  topic?: string
  awaiting_response?: string
  created_at: string
}

export interface Workspace {
  id: string
  name: string
  description?: string
  icon?: string
  role?: string
  souls?: { id: string; name: string; status: string }[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  topic?: string
  timestamp: string
  awaitingHuman?: { taskId: string; question: string; options?: string[] }
}
