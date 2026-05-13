<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header">
        <h2>👥 用户管理</h2>
        <el-button type="primary" :icon="Plus" @click="showAdd = true">新增用户</el-button>
      </div>

      <el-card>
        <el-form :inline="true" :model="filter" class="filter-form">
          <el-form-item><el-input v-model="filter.keyword" placeholder="搜索用户名/邮箱" prefix-icon="Search" /></el-form-item>
          <el-form-item>
            <el-select v-model="filter.role" placeholder="角色">
              <el-option label="全部" value="" />
              <el-option label="管理员" value="admin" />
              <el-option label="普通用户" value="user" />
            </el-select>
          </el-form-item>
          <el-form-item><el-button type="primary" @click="loadUsers">查询</el-button></el-form-item>
        </el-form>

        <el-table :data="users" v-loading="loading" stripe>
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="用户信息" min-width="180">
            <template #default="{ row }">
              <div style="display:flex;align-items:center;gap:8px">
                <el-avatar :size="32">{{ row.username?.[0]?.toUpperCase() }}</el-avatar>
                <div>
                  <div>{{ row.username }}</div>
                  <div style="font-size:12px;color:#999">{{ row.email }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.is_admin ? 'danger' : 'info'">{{ row.is_admin ? '管理员' : '用户' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="注册时间" width="160" />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'warning'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button text size="small" @click="editUser(row)">编辑</el-button>
              <el-button text size="small" type="primary" @click="toggleRole(row)">{{ row.is_admin ? '降权' : '提权' }}</el-button>
              <el-button text size="small" type="danger" @click="deleteUser(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :total="total" layout="total, prev, pager, next" style="margin-top:16px;justify-content:flex-end" />
      </el-card>

      <el-dialog v-model="showAdd" :title="isEdit ? '编辑用户' : '新增用户'" width="500px" destroy-on-close>
        <el-form :model="form" label-width="80px">
          <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
          <el-form-item label="密码" v-if="!isEdit"><el-input v-model="form.password" type="password" show-password /></el-form-item>
          <el-form-item label="角色">
            <el-radio-group v-model="form.is_admin">
              <el-radio-button :label="false">普通用户</el-radio-button>
              <el-radio-button :label="true">管理员</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showAdd = false">取消</el-button>
          <el-button type="primary" @click="saveUser">保存</el-button>
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

const loading = ref(false)
const showAdd = ref(false)
const isEdit = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(42)
const filter = reactive({ keyword: '', role: '' })

const users = ref([
  { id: 1, username: 'admin', email: 'admin@openclaw.ai', is_admin: true, status: 'active', created_at: '2026-04-01 10:00:00' },
  { id: 2, username: 'zhangsan', email: 'zhang@example.com', is_admin: false, status: 'active', created_at: '2026-04-15 14:30:00' },
  { id: 3, username: 'lisi', email: 'li@example.com', is_admin: false, status: 'inactive', created_at: '2026-05-01 09:00:00' },
  { id: 4, username: 'wangwu', email: 'wang@example.com', is_admin: false, status: 'active', created_at: '2026-05-05 16:45:00' },
])

const form = reactive({ username: '', email: '', password: '', is_admin: false, id: null as number | null })

function loadUsers() { loading.value = true; setTimeout(() => loading.value = false, 300) }
function editUser(row: any) { isEdit.value = true; Object.assign(form, row); showAdd.value = true }
function toggleRole(row: any) {
  ElMessageBox.confirm(`确定将 "${row.username}" ${row.is_admin ? '降为普通用户' : '提升为管理员'}?`, '确认').then(() => {
    row.is_admin = !row.is_admin
    ElMessage.success('操作成功')
  }).catch(() => {})
}
function deleteUser(id: number) {
  ElMessageBox.confirm('确定删除该用户?', '警告', { type: 'warning' }).then(() => {
    users.value = users.value.filter(u => u.id !== id)
    ElMessage.success('已删除')
  }).catch(() => {})
}
function saveUser() {
  if (isEdit.value) {
    const idx = users.value.findIndex(u => u.id === form.id)
    if (idx >= 0) users.value[idx] = { ...users.value[idx], ...form }
  } else {
    users.value.push({ ...form, id: Date.now(), status: 'active', created_at: new Date().toLocaleString() })
  }
  showAdd.value = false
  ElMessage.success('保存成功')
}
</script>

<style scoped>
.filter-form { margin-bottom: 16px; }
</style>
