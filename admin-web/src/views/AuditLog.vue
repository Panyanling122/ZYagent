<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header">
        <h2>📋 审计日志</h2>
        <div>
          <el-button :icon="Download" @click="exportLog('csv')">导出CSV</el-button>
          <el-button :icon="Download" @click="exportLog('json')">导出JSON</el-button>
        </div>
      </div>
      <el-card>
        <el-form :inline="true" :model="filter" class="filter-form">
          <el-form-item><el-input v-model="filter.keyword" placeholder="搜索操作/用户" prefix-icon="Search" /></el-form-item>
          <el-form-item>
            <el-select v-model="filter.level" placeholder="级别">
              <el-option label="全部" value="" /><el-option label="INFO" value="info" />
              <el-option label="WARN" value="warn" /><el-option label="ERROR" value="error" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-date-picker v-model="filter.dateRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" />
          </el-form-item>
          <el-form-item><el-button type="primary" @click="loadLogs">查询</el-button></el-form-item>
        </el-form>

        <el-timeline>
          <el-timeline-item
            v-for="log in logs" :key="log.id"
            :type="log.level === 'error' ? 'danger' : log.level === 'warn' ? 'warning' : 'primary'"
            :timestamp="log.created_at"
          >
            <el-card shadow="hover" :body-style="{ padding: '12px 16px' }">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <el-tag :type="log.level === 'error' ? 'danger' : log.level === 'warn' ? 'warning' : 'info'" size="small">{{ log.level.toUpperCase() }}</el-tag>
                  <span style="margin-left:8px;font-weight:500">{{ log.action }}</span>
                </div>
                <span style="font-size:12px;color:#999">{{ log.user }}</span>
              </div>
              <p style="margin-top:6px;font-size:13px;color:#4b5563">{{ log.detail }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>

        <el-pagination v-model:current-page="page" :total="total" layout="total, prev, pager, next" style="margin-top:16px;justify-content:flex-end" />
      </el-card>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Search, Download } from '@element-plus/icons-vue'
import AdminLayout from '@/components/AdminLayout.vue'
import { ElMessage } from 'element-plus'

const page = ref(1)
const total = ref(156)
const filter = reactive({ keyword: '', level: '', dateRange: [] as Date[] })

const logs = ref([
  { id: 1, level: 'info', action: '用户登录', detail: '用户 admin 成功登录系统', user: 'admin', created_at: '2026-05-06 10:30:00' },
  { id: 2, level: 'warn', action: '任务超时', detail: '任务 #12345 响应时间超过5秒', user: 'system', created_at: '2026-05-06 10:25:00' },
  { id: 3, level: 'error', action: 'API调用失败', detail: '调用 /api/tasks 返回500错误: 数据库连接超时', user: 'Soul-Beta', created_at: '2026-05-06 10:20:00' },
  { id: 4, level: 'info', action: 'Soul配置更新', detail: '管理员修改了 Soul-Alpha 的系统提示词', user: 'admin', created_at: '2026-05-06 10:15:00' },
  { id: 5, level: 'info', action: '用户绑定微信', detail: '用户 zhangsan 成功绑定微信账号', user: 'zhangsan', created_at: '2026-05-06 10:10:00' },
  { id: 6, level: 'warn', action: 'Token用量预警', detail: '今日Token用量已达日限额的85%', user: 'system', created_at: '2026-05-06 10:05:00' },
  { id: 7, level: 'info', action: '数据备份', detail: '系统自动备份完成，大小: 256MB', user: 'system', created_at: '2026-05-06 10:00:00' },
  { id: 8, level: 'error', action: 'WebSocket断开', detail: '客户端 ws_abc123 异常断开连接', user: 'system', created_at: '2026-05-06 09:55:00' },
])

function loadLogs() { ElMessage.success('查询完成') }
function exportLog(format: string) {
  const blob = new Blob([JSON.stringify(logs.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `audit_log.${format}`; a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${format.toUpperCase()}`)
}
</script>

<style scoped>
.filter-form { margin-bottom: 16px; }
</style>
