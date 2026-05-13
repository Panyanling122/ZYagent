<template>
  <div class="board">
    <div v-for="col in columns" :key="col.id" class="column" :data-status="col.id">
      <div class="column-header">
        <span class="column-title">{{ col.title }}</span>
        <el-tag size="small" type="info">{{ colTasks(col.id).length }}</el-tag>
      </div>
      <div class="column-body" :data-status="col.id" ref="colRefs">
        <TaskCard
          v-for="task in colTasks(col.id)"
          :key="task.id"
          :task="task"
          :is-dragging="draggingId === task.id"
          @dragstart="draggingId = task.id"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import TaskCard from './TaskCard.vue'
import type { TaskStatus } from '@/types'

const taskStore = useTaskStore()
const workspaceStore = useWorkspaceStore()
const draggingId = ref<string | null>(null)
const colRefs = ref<HTMLElement[]>([])

const columns: { id: TaskStatus; title: string }[] = [
  { id: 'backlog', title: '📥 待办' },
  { id: 'todo', title: '📋 准备' },
  { id: 'in_progress', title: '🔄 进行中' },
  { id: 'review', title: '👀 审核' },
  { id: 'done', title: '✅ 完成' },
]

function colTasks(status: TaskStatus) {
  return taskStore.tasks.filter(t => t.status === status)
}

onMounted(() => {
  if (workspaceStore.currentId) taskStore.fetchTasks(workspaceStore.currentId)
  nextTick(() => {
    const bodies = document.querySelectorAll('.column-body')
    bodies.forEach(el => {
      new Sortable(el as HTMLElement, {
        group: 'kanban',
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onEnd: (evt) => {
          const newStatus = (evt.to as HTMLElement).dataset.status as TaskStatus
          const taskId = (evt.item as HTMLElement).dataset.taskId
          if (taskId && newStatus) taskStore.moveTask(taskId, newStatus)
          draggingId.value = null
        },
      })
    })
  })
})
</script>

<style scoped>
.board { display: flex; gap: 12px; height: 100%; overflow-x: auto; padding-bottom: 4px; }
.column { width: 240px; flex-shrink: 0; background: #f3f4f6; border-radius: 10px; display: flex; flex-direction: column; }
.column-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: rgba(255,255,255,0.6); border-radius: 10px 10px 0 0; }
.column-title { font-size: 13px; font-weight: 600; color: #374151; }
.column-body { flex: 1; padding: 8px; overflow-y: auto; min-height: 120px; }
:deep(.sortable-ghost) { opacity: 0.4; background: #dbeafe; }
:deep(.sortable-drag) { cursor: grabbing; }
</style>
