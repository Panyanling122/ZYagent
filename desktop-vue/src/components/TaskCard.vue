<template>
  <div
    class="task-card"
    :data-task-id="task.id"
    :class="{ 'is-dragging': isDragging, 'awaiting': task.status === 'awaiting_human' }"
  >
    <div class="card-header">
      <el-tag :type="priorityType(task.priority)" size="small">{{ task.priority.toUpperCase() }}</el-tag>
      <span class="task-type">{{ typeLabel(task.type) }}</span>
    </div>
    <div class="card-title">{{ task.title }}</div>
    <div v-if="task.awaiting_response" class="card-alert">
      <el-icon><Warning /></el-icon>
      <span>待确认</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Warning } from '@element-plus/icons-vue'
import type { Task } from '@/types'

const props = defineProps<{
  task: Task
  isDragging?: boolean
}>()

function priorityType(p: string): string {
  const map: Record<string, string> = { p0: 'danger', p1: 'warning', p2: 'info', p3: 'success' }
  return map[p] || 'info'
}

function typeLabel(t: string): string {
  const map: Record<string, string> = { human_task: '人工', ai_task: 'AI', mixed: '协作' }
  return map[t] || t
}
</script>

<style scoped>
.task-card { background: #fff; border-radius: 8px; padding: 10px; margin-bottom: 8px; cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all .2s; border: 1px solid transparent; }
.task-card:hover { box-shadow: 0 4px 6px rgba(0,0,0,0.1); transform: translateY(-1px); }
.task-card.is-dragging { opacity: 0.5; }
.task-card.awaiting { border-color: #fbbf24; background: #fffbeb; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.task-type { font-size: 11px; color: #9ca3af; }
.card-title { font-size: 13px; font-weight: 500; color: #1f2937; line-height: 1.4; }
.card-alert { display: flex; align-items: center; gap: 4px; margin-top: 6px; padding: 4px 8px; background: #fef3c7; border-radius: 4px; font-size: 11px; color: #92400e; }
</style>
