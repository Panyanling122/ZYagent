<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>🏢 工作空间管理</h2><el-button type="primary" :icon="Plus" @click="showAdd = true">新增空间</el-button></div>
      <el-table :data="workspaces" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="名称"><template #default="{row}"><span style="font-size:18px;margin-right:4px">{{ row.icon }}</span>{{ row.name }}</template></el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" />
        <el-table-column prop="member_count" label="成员" width="80" />
        <el-table-column prop="task_count" label="任务" width="80" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{row}"><el-button text size="small" @click="editWs(row)">编辑</el-button><el-button text size="small" type="danger" @click="deleteWs(row.id)">删除</el-button></template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="showAdd" :title="isEdit ? '编辑空间' : '新增空间'" width="500px">
        <el-form :model="form" label-width="80px">
          <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="图标"><el-input v-model="form.icon" placeholder="emoji" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
        </el-form>
        <template #footer><el-button @click="showAdd = false">取消</el-button><el-button type="primary" @click="saveWs">保存</el-button></template>
      </el-dialog>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import AdminLayout from '@/components/AdminLayout.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const showAdd = ref(false)
const isEdit = ref(false)
const workspaces = ref([
  { id: 'ws-1', name: '默认空间', icon: '🏠', description: '默认工作空间', member_count: 3, task_count: 12, created_at: '2026-04-01' },
  { id: 'ws-2', name: '研发团队', icon: '🔬', description: '研发部门工作空间', member_count: 8, task_count: 45, created_at: '2026-04-10' },
  { id: 'ws-3', name: '市场部', icon: '📢', description: '市场营销工作空间', member_count: 5, task_count: 23, created_at: '2026-05-01' },
])
const form = reactive({ name: '', icon: '', description: '', id: '' })

function editWs(row: any) { isEdit.value = true; Object.assign(form, row); showAdd.value = true }
function deleteWs(id: string) { ElMessageBox.confirm('确定删除该工作空间?', '警告').then(() => { workspaces.value = workspaces.value.filter(w => w.id !== id); ElMessage.success('已删除') }).catch(() => {}) }
function saveWs() {
  if (isEdit.value) { const i = workspaces.value.findIndex(w => w.id === form.id); if (i >= 0) Object.assign(workspaces.value[i], form) }
  else { workspaces.value.push({ ...form, id: `ws-${Date.now()}`, member_count: 0, task_count: 0, created_at: new Date().toISOString().slice(0,10) }) }
  showAdd.value = false; ElMessage.success('保存成功')
}
</script>
