<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header">
        <h2>📊 系统概览</h2>
        <el-button :icon="Refresh" :loading="adminStore.loading" @click="adminStore.fetchStats">刷新</el-button>
      </div>

      <el-row :gutter="16" class="stats-row">
        <el-col :span="4" v-for="s in statCards" :key="s.key">
          <el-card shadow="hover">
            <div class="stat-card">
              <div class="stat-value" :style="{ color: s.color }">{{ adminStore.stats[s.key] || 0 }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="charts-row">
        <el-col :span="12">
          <el-card title="Token 用量趋势">
            <template #header><span>📈 Token 用量趋势</span></template>
            <div ref="tokenChart" style="height:300px"></div>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card>
            <template #header><span>🥧 任务状态分布</span></template>
            <div ref="taskChart" style="height:300px"></div>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="info-row">
        <el-col :span="12">
          <el-card>
            <template #header><span>⚡ 快捷操作</span></template>
            <el-space wrap>
              <el-button type="primary" @click="$router.push('/users')">用户管理</el-button>
              <el-button type="primary" @click="$router.push('/souls')">Soul 配置</el-button>
              <el-button type="primary" @click="$router.push('/tasks')">任务查看</el-button>
              <el-button @click="$router.push('/audit')">审计日志</el-button>
            </el-space>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card>
            <template #header><span>💰 Token 用量</span></template>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="今日">{{ adminStore.tokenUsage.daily }} tokens</el-descriptions-item>
              <el-descriptions-item label="本月">{{ adminStore.tokenUsage.monthly }} tokens</el-descriptions-item>
              <el-descriptions-item label="累计">{{ adminStore.tokenUsage.total }} tokens</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useAdminStore } from '@/stores/adminStore'
import AdminLayout from '@/components/AdminLayout.vue'

const adminStore = useAdminStore()
const tokenChart = ref<HTMLElement>()
const taskChart = ref<HTMLElement>()
let chart1: echarts.ECharts | null = null
let chart2: echarts.ECharts | null = null

const statCards = [
  { key: 'users', label: '用户', color: '#2563eb' },
  { key: 'workspaces', label: '工作空间', color: '#7c3aed' },
  { key: 'souls', label: 'Soul', color: '#db2777' },
  { key: 'tasks', label: '任务', color: '#ea580c' },
  { key: 'messages', label: '消息', color: '#16a34a' },
]

onMounted(() => {
  adminStore.fetchStats()

  if (tokenChart.value) {
    chart1 = echarts.init(tokenChart.value)
    chart1.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['周一','周二','周三','周四','周五','周六','周日'] },
      yAxis: { type: 'value' },
      series: [{ data: [820,932,901,934,1290,1330,1320], type: 'line', smooth: true, areaStyle: {} }],
    })
  }

  if (taskChart.value) {
    chart2 = echarts.init(taskChart.value)
    chart2.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['40%','70%'],
        data: [
          { value: 1048, name: '待办' },
          { value: 735, name: '进行中' },
          { value: 580, name: '审核' },
          { value: 484, name: '完成' },
          { value: 300, name: '挂起' },
        ],
      }],
    })
  }
})

onUnmounted(() => { chart1?.dispose(); chart2?.dispose(); })
</script>

<style scoped>
.stats-row { margin-bottom: 20px; }
.charts-row { margin-bottom: 20px; }
.info-row { margin-bottom: 20px; }
</style>
