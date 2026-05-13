<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>⚙️ 系统设置</h2></div>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-card>
            <template #header><span>🔑 API 密钥配置</span></template>
            <el-form :model="settings" label-width="140px">
              <el-form-item label="OpenAI API Key">
                <el-input v-model="settings.openai_key" type="password" show-password placeholder="sk-..." />
              </el-form-item>
              <el-form-item label="Anthropic API Key">
                <el-input v-model="settings.anthropic_key" type="password" show-password placeholder="sk-ant-..." />
              </el-form-item>
              <el-form-item label="Azure API Key">
                <el-input v-model="settings.azure_key" type="password" show-password />
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card>
            <template #header><span>📊 用量限制</span></template>
            <el-form :model="settings" label-width="140px">
              <el-form-item label="每日Token上限"><el-input-number v-model="settings.daily_token_limit" :min="1000" :step="1000" style="width:200px" /></el-form-item>
              <el-form-item label="每分钟请求数"><el-input-number v-model="settings.rate_limit_rpm" :min="10" :step="10" style="width:200px" /></el-form-item>
              <el-form-item label="并发连接数"><el-input-number v-model="settings.max_concurrent" :min="1" :max="100" style="width:200px" /></el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="20" style="margin-top:20px">
        <el-col :span="12">
          <el-card>
            <template #header><span>🔔 通知配置</span></template>
            <el-form :model="settings" label-width="140px">
              <el-form-item label="系统通知"><el-switch v-model="settings.notify_system" /></el-form-item>
              <el-form-item label="任务提醒"><el-switch v-model="settings.notify_task" /></el-form-item>
              <el-form-item label="异常告警"><el-switch v-model="settings.notify_alert" /></el-form-item>
              <el-form-item label="告警邮箱"><el-input v-model="settings.alert_email" placeholder="admin@example.com" /></el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card>
            <template #header><span>💾 备份与维护</span></template>
            <el-form :model="settings" label-width="140px">
              <el-form-item label="自动备份"><el-switch v-model="settings.auto_backup" /></el-form-item>
              <el-form-item label="备份周期">
                <el-select v-model="settings.backup_interval"><el-option label="每小时" value="1h" /><el-option label="每天" value="1d" /><el-option label="每周" value="1w" /></el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="manualBackup">立即备份</el-button>
                <el-button @click="restoreBackup">恢复备份</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <div style="margin-top:20px;text-align:center">
        <el-button type="primary" size="large" @click="saveSettings">保存设置</el-button>
        <el-button size="large" @click="resetSettings">重置</el-button>
      </div>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import AdminLayout from '@/components/AdminLayout.vue'
import { ElMessage } from 'element-plus'

const settings = reactive({
  openai_key: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
  anthropic_key: '',
  azure_key: '',
  daily_token_limit: 100000,
  rate_limit_rpm: 60,
  max_concurrent: 20,
  notify_system: true,
  notify_task: true,
  notify_alert: true,
  alert_email: 'admin@openclaw.ai',
  auto_backup: true,
  backup_interval: '1d',
})

function saveSettings() { ElMessage.success('设置已保存') }
function resetSettings() { ElMessage.info('已重置') }
function manualBackup() { ElMessage.success('备份已开始，稍后通知') }
function restoreBackup() { ElMessageBox.confirm('确定恢复备份? 当前数据将被覆盖。').then(() => ElMessage.success('恢复成功')).catch(() => {}) }
</script>

<style scoped>
.el-card { margin-bottom: 0; }
</style>
