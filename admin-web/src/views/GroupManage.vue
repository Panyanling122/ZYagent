<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>👥 群管理</h2><el-button type="primary" :icon="Plus" @click="showAdd = true">新增群</el-button></div>
      <el-row :gutter="16">
        <el-col :span="8" v-for="group in groups" :key="group.id">
          <el-card shadow="hover" class="group-card">
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600">{{ group.name }}</span>
                <el-tag :type="group.status === 'active' ? 'success' : 'info'" size="small">{{ group.status }}</el-tag>
              </div>
            </template>
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="群ID">{{ group.chat_id }}</el-descriptions-item>
              <el-descriptions-item label="成员数">{{ group.member_count }}人</el-descriptions-item>
              <el-descriptions-item label="消息数">{{ group.message_count }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ group.created_at }}</el-descriptions-item>
              <el-descriptions-item label="绑定Soul">{{ group.soul_name || '未绑定' }}</el-descriptions-item>
            </el-descriptions>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
              <el-button text size="small" @click="editGroup(group)">编辑</el-button>
              <el-button text size="small" type="danger" @click="deleteGroup(group.id)">删除</el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-dialog v-model="showAdd" :title="isEdit ? '编辑群' : '新增群'" width="500px">
        <el-form :model="form" label-width="80px">
          <el-form-item label="群名称"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="群ID"><el-input v-model="form.chat_id" placeholder="微信/飞书群ID" /></el-form-item>
          <el-form-item label="绑定Soul"><el-select v-model="form.soul_id"><el-option v-for="s in soulOptions" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item>
        </el-form>
        <template #footer><el-button @click="showAdd = false">取消</el-button><el-button type="primary" @click="saveGroup">保存</el-button></template>
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
const soulOptions = ref([
  { id: 's1', name: 'Soul-Alpha' }, { id: 's2', name: 'Soul-Beta' },
  { id: 's3', name: 'Soul-Gamma' }, { id: 's4', name: 'Soul-Delta' },
])
const groups = ref([
  { id: 'g1', name: '技术交流群', chat_id: 'wx_group_001', member_count: 56, message_count: 1280, status: 'active', created_at: '2026-04-01', soul_name: 'Soul-Beta' },
  { id: 'g2', name: '产品讨论组', chat_id: 'wx_group_002', member_count: 23, message_count: 456, status: 'active', created_at: '2026-04-15', soul_name: 'Soul-Alpha' },
  { id: 'g3', name: '销售团队', chat_id: 'wx_group_003', member_count: 12, message_count: 89, status: 'inactive', created_at: '2026-05-01', soul_name: 'Soul-Gamma' },
])
const form = reactive({ name: '', chat_id: '', soul_id: '', id: '' })

function editGroup(g: any) { isEdit.value = true; Object.assign(form, g); showAdd.value = true }
function deleteGroup(id: string) { ElMessageBox.confirm('确定删除该群?', '警告').then(() => { groups.value = groups.value.filter(g => g.id !== id); ElMessage.success('已删除') }).catch(() => {}) }
function saveGroup() {
  const soul = soulOptions.value.find(s => s.id === form.soul_id)
  if (isEdit.value) { const i = groups.value.findIndex(g => g.id === form.id); if (i >= 0) Object.assign(groups.value[i], { ...form, soul_name: soul?.name }) }
  else { groups.value.push({ ...form, id: `g${Date.now()}`, member_count: 0, message_count: 0, status: 'active', created_at: new Date().toISOString().slice(0,10), soul_name: soul?.name }) }
  showAdd.value = false; ElMessage.success('保存成功')
}
</script>

<style scoped>
.group-card { margin-bottom: 16px; transition: all .2s; }
.group-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.08); }
</style>
