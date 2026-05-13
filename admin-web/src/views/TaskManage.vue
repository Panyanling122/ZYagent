<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>📋 任务管理</h2>
        <div>
          <el-button :icon="Filter" text>筛选</el-button>
          <el-button type="primary" :icon="Plus" @click="showAdd = true">新建任务</el-button>
        </div>
      </div>
      <el-card>
        <el-table :data="tasks" stripe v-loading="loading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="任务" min-width="200">
            <template #default="{row}">
              <div style="font-weight:500">{{ row.title }}</div>
              <div style="font-size:12px;color:#999">{{ row.description }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="优先级" width="80"><template #default="{row}"><el-tag :type="priorityType(row.priority)" size="small">{{ row.priority?.toUpperCase() }}</el-tag></template></el-table-column>
          <el-table-column prop="assigned_to" label="负责人" width="120" />
          <el-table-column prop="created_at" label="创建时间" width="160" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{row}"><el-button text size="small" @click="editTask(row)">编辑</el-button><el-button text size="small" type="danger" @click="deleteTask(row.id)">删除</el-button></template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" style="margin-top:16px;justify-content:flex-end" />
      </el-card>

      <el-dialog v-model="showAdd" :title="isEdit ? '编辑任务' : '新建任务'" width="500px">
        <el-form :model="form" label-width="80px">
          <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="状态"><el-select v-model="form.status"><el-option v-for="s in statuses" :key="s.value" :label="s.label" :value="s.value" /></el-select></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="优先级"><el-select v-model="form.priority"><el-option v-for="p in priorities" :key="p" :label="p.toUpperCase()" :value="p" /></el-select></el-form-item></el-col>
          </el-row>
          <el-form-item label="负责人"><el-input v-model="form.assigned_to" /></el-form-item>
        </el-form>
        <template #footer><el-button @click="showAdd = false">取消</el-button><el-button type="primary" @click="saveTask">保存</el-button></template>
      </el-dialog>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Plus, Filter } from '@element-plus/icons-vue'
import AdminLayout from '@/components/AdminLayout.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const showAdd = ref(false)
const isEdit = ref(false)
const page = ref(1)
const total = ref(86)
const priorities = ['p0','p1','p2','p3']
const statuses = [
  { value: 'backlog', label: '待办' }, { value: 'todo', label: '准备' },
  { value: 'in_progress', label: '进行中' }, { value: 'review', label: '审核' },
  { value: 'done', label: '完成' }, { value: 'awaiting_human', label: '挂起' },
]

const tasks = ref([
  { id: 't1', title: '客户报价确认', description: '涉及金额审批，需要人工确认', status: 'awaiting_human', priority: 'p0', assigned_to: 'zhangsan', created_at: '2026-05-06 09:00:00' },
  { id: 't2', title: 'Q3 报表生成', description: '自动生成Q3季度业务报表', status: 'in_progress', priority: 'p1', assigned_to: 'Soul-Beta', created_at: '2026-05-05 14:30:00' },
  { id: 't3', title: '产品需求文档', description: '整理产品v2.0需求文档', status: 'backlog', priority: 'p2', assigned_to: 'lisi', created_at: '2026-05-04 11:00:00' },
  { id: 't4', title: '数据清洗', description: '清洗用户导入的原始数据', status: 'todo', priority: 'p1', assigned_to: 'Soul-Gamma', created_at: '2026-05-03 16:00:00' },
  { id: 't5', title: '部署环境优化', description: '优化生产环境Docker配置', status: 'done', priority: 'p2', assigned_to: 'admin', created_at: '2026-05-01 10:00:00' },
])

const form = reactive({ title: '', description: '', status: 'backlog', priority: 'p2', assigned_to: '', id: '' })

function statusType(s: string) { const map: Record<string,string> = { backlog:'info',todo:'',in_progress:'warning',review:'primary',done:'success',awaiting_human:'danger' }; return map[s] || '' }
function statusLabel(s: string) { return statuses.find(x => x.value === s)?.label || s }
function priorityType(p: string) { const map: Record<string,string> = { p0:'danger',p1:'warning',p2:'info',p3:'success' }; return map[p] || 'info' }
function editTask(row: any) { isEdit.value = true; Object.assign(form, row); showAdd.value = true }
function deleteTask(id: string) { ElMessageBox.confirm('确定删除该任务?', '警告').then(() => { tasks.value = tasks.value.filter(t => t.id !== id); ElMessage.success('已删除') }).catch(() => {}) }
function saveTask() {
  if (isEdit.value) { const i = tasks.value.findIndex(t => t.id === form.id); if (i >= 0) Object.assign(tasks.value[i], form) }
  else { tasks.value.unshift({ ...form, id: `t${Date.now()}`, created_at: new Date().toLocaleString() }) }
  showAdd.value = false; ElMessage.success('保存成功')
}
</script>
