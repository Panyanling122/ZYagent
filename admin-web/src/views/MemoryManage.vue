<template>
  <AdminLayout>
    <div class="page-container">
      <div class="page-header"><h2>🧠 记忆管理</h2>
        <el-input v-model="search" placeholder="搜索记忆内容..." prefix-icon="Search" style="width:300px" clearable />
      </div>
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card><div class="stat-card"><div class="stat-value" style="color:#2563eb">{{ memories.length }}</div><div class="stat-label">记忆条目</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card><div class="stat-card"><div class="stat-value" style="color:#7c3aed">{{ souls.length }}</div><div class="stat-label">Soul 数量</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card><div class="stat-card"><div class="stat-value" style="color:#16a34a">{{ avgRelevance }}%</div><div class="stat-label">平均相关度</div></div></el-card>
        </el-col>
        <el-col :span="6">
          <el-card><div class="stat-card"><div class="stat-value" style="color:#ea580c">{{ lastSync }}</div><div class="stat-label">最后同步</div></div></el-card>
        </el-col>
      </el-row>

      <el-card style="margin-top:20px">
        <el-table :data="filteredMemories" stripe>
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="内容" min-width="300">
            <template #default="{row}">
              <div style="font-size:13px;line-height:1.5">{{ row.content }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="soul_name" label="所属Soul" width="120" />
          <el-table-column prop="topic" label="主题" width="120" />
          <el-table-column label="相关度" width="100">
            <template #default="{row}">
              <el-progress :percentage="row.relevance" :color="row.relevance > 80 ? '#67c23a' : row.relevance > 50 ? '#e6a23c' : '#f56c6c'" />
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="时间" width="160" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{row}">
              <el-button text size="small" type="danger" @click="deleteMemory(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </AdminLayout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import AdminLayout from '@/components/AdminLayout.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const search = ref('')
const souls = ref([{ id: 's1', name: 'Soul-Alpha' }, { id: 's2', name: 'Soul-Beta' }])
const avgRelevance = ref(72)
const lastSync = ref('2分钟前')

const memories = ref([
  { id: 1, content: '用户偏好使用简洁风格回复，不喜欢冗长解释。在代码相关问题上希望直接给出可运行的示例。', soul_name: 'Soul-Alpha', topic: '用户偏好', relevance: 95, created_at: '2026-05-06 10:30:00' },
  { id: 2, content: '客户A的报价单已通过审核，最终价格为¥128,000，交付周期3个月。', soul_name: 'Soul-Beta', topic: '客户报价', relevance: 88, created_at: '2026-05-05 16:00:00' },
  { id: 3, content: 'Q3季度的销售目标是增长25%，重点关注华东和华南市场。', soul_name: 'Soul-Gamma', topic: '销售目标', relevance: 76, created_at: '2026-05-04 09:00:00' },
  { id: 4, content: '技术架构已从单体迁移到微服务，使用Kubernetes进行容器编排。', soul_name: 'Soul-Beta', topic: '技术架构', relevance: 82, created_at: '2026-05-03 14:00:00' },
  { id: 5, content: '用户反馈移动端体验需要优化，特别是聊天界面的响应速度。', soul_name: 'Soul-Alpha', topic: '用户反馈', relevance: 90, created_at: '2026-05-02 11:00:00' },
])

const filteredMemories = computed(() => {
  if (!search.value) return memories.value
  return memories.value.filter(m => m.content.includes(search.value) || m.topic.includes(search.value))
})

function deleteMemory(id: number) {
  ElMessageBox.confirm('确定删除该记忆?', '警告').then(() => {
    memories.value = memories.value.filter(m => m.id !== id)
    ElMessage.success('已删除')
  }).catch(() => {})
}
</script>
