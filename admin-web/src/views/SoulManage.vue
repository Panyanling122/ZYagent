<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>🤖 Soul 管理</h2><el-button type="primary" :icon="Plus" @click="showAdd = true">新增 Soul</el-button></div>
      <el-row :gutter="16">
        <el-col :span="8" v-for="soul in souls" :key="soul.id">
          <el-card shadow="hover" class="soul-card">
            <template #header>
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600">{{ soul.name }}</span>
                <el-tag :type="soul.status === 'online' ? 'success' : 'info'" size="small">{{ soul.status }}</el-tag>
              </div>
            </template>
            <p style="color:#6b7280;font-size:13px;margin-bottom:8px">{{ soul.description }}</p>
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="模型">{{ soul.model }}</el-descriptions-item>
              <el-descriptions-item label="温度">{{ soul.temperature }}</el-descriptions-item>
              <el-descriptions-item label="最大Token">{{ soul.max_tokens }}</el-descriptions-item>
              <el-descriptions-item label="技能">{{ soul.skills?.length || 0 }}个</el-descriptions-item>
            </el-descriptions>
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
              <el-button text size="small" @click="editSoul(soul)">编辑</el-button>
              <el-button text size="small" type="danger" @click="deleteSoul(soul.id)">删除</el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-dialog v-model="showAdd" :title="isEdit ? '编辑 Soul' : '新增 Soul'" width="600px" destroy-on-close>
        <el-form :model="form" label-width="100px">
          <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="模型"><el-select v-model="form.model"><el-option label="GPT-4o" value="gpt-4o" /><el-option label="GPT-4" value="gpt-4" /><el-option label="GPT-3.5" value="gpt-3.5-turbo" /></el-select></el-form-item>
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="温度"><el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="Max Tokens"><el-input-number v-model="form.max_tokens" :min="256" :max="8192" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="系统提示词"><el-input v-model="form.system_prompt" type="textarea" :rows="4" placeholder="定义Soul的行为和知识..." /></el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showAdd = false">取消</el-button>
          <el-button type="primary" @click="saveSoul">保存</el-button>
        </template>
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
const souls = ref([
  { id: 's1', name: 'Soul-Alpha', description: '通用对话助手，擅长自然语言理解和生成', model: 'gpt-4o', temperature: 0.7, max_tokens: 4096, status: 'online', skills: [] },
  { id: 's2', name: 'Soul-Beta', description: '代码专家，擅长编程和技术问题解答', model: 'gpt-4o', temperature: 0.3, max_tokens: 8192, status: 'online', skills: [] },
  { id: 's3', name: 'Soul-Gamma', description: '数据分析助手，擅长处理和解读数据', model: 'gpt-4', temperature: 0.5, max_tokens: 4096, status: 'online', skills: [] },
  { id: 's4', name: 'Soul-Delta', description: '创意写作助手，擅长文案和创意内容', model: 'gpt-4', temperature: 1.0, max_tokens: 4096, status: 'offline', skills: [] },
])

const form = reactive({ name: '', description: '', model: 'gpt-4o', temperature: 0.7, max_tokens: 4096, system_prompt: '', id: '' })

function editSoul(s: any) { isEdit.value = true; Object.assign(form, s); showAdd.value = true }
function deleteSoul(id: string) { ElMessageBox.confirm('确定删除该Soul?', '警告').then(() => { souls.value = souls.value.filter(s => s.id !== id); ElMessage.success('已删除') }).catch(() => {}) }
function saveSoul() {
  if (isEdit.value) { const i = souls.value.findIndex(s => s.id === form.id); if (i >= 0) Object.assign(souls.value[i], form) }
  else { souls.value.push({ ...form, id: `s${Date.now()}`, status: 'online', skills: [] }) }
  showAdd.value = false; ElMessage.success('保存成功')
}
</script>

<style scoped>
.soul-card { margin-bottom: 16px; transition: all .2s; }
.soul-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.08); }
</style>
