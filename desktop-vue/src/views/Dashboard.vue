<template>
  <div class="dashboard">
    <div class="dash-header">
      <div>
        <h2>{{ currentName }}</h2>
        <p class="subtitle">{{ currentDesc }}</p>
      </div>
      <div class="header-actions">
        <el-button :icon="Filter" text>筛选</el-button>
        <el-button type="primary" :icon="Plus" @click="showNewTask = true">新建任务</el-button>
      </div>
    </div>
    <KanbanBoard />

    <el-dialog v-model="showNewTask" title="新建任务" width="500px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="任务标题" required>
          <el-input v-model="newTask.title" placeholder="任务标题" @keyup.enter="handleCreate" />
        </el-form-item>
        <el-form-item label="任务描述">
          <el-input v-model="newTask.description" type="textarea" :rows="2" placeholder="任务描述（可选）" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="优先级">
              <el-select v-model="newTask.priority" style="width:100%">
                <el-option label="P0 紧急" value="p0" />
                <el-option label="P1 高" value="p1" />
                <el-option label="P2 中" value="p2" />
                <el-option label="P3 低" value="p3" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="类型">
              <el-select v-model="newTask.type" style="width:100%">
                <el-option label="人工任务" value="human_task" />
                <el-option label="AI 任务" value="ai_task" />
                <el-option label="协作任务" value="mixed" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showNewTask = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { Plus, Filter } from '@element-plus/icons-vue'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTaskStore } from '@/stores/taskStore'
import KanbanBoard from '@/components/KanbanBoard.vue'

const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const showNewTask = ref(false)
const creating = ref(false)
const newTask = reactive({ title: '', description: '', priority: 'p2', type: 'human_task' })

const currentName = computed(() => {
  const ws = workspaceStore.workspaces.find(w => w.id === workspaceStore.currentId)
  return (ws?.icon || '📋') + ' ' + (ws?.name || '看板')
})

const currentDesc = computed(() => {
  const ws = workspaceStore.workspaces.find(w => w.id === workspaceStore.currentId)
  return ws?.description || '拖拽卡片变更状态'
})

async function handleCreate() {
  if (!newTask.title.trim()) return
  creating.value = true
  try {
    await taskStore.createTask({
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      priority: newTask.priority,
      type: newTask.type,
      status: 'backlog',
    })
    newTask.title = ''
    newTask.description = ''
    showNewTask.value = false
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.dashboard { height: 100%; display: flex; flex-direction: column; }
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.dash-header h2 { font-size: 18px; font-weight: 700; color: #111827; }
.subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
.header-actions { display: flex; gap: 8px; }
</style>
