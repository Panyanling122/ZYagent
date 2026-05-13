<template>
  <div class="doc-page">
    <div class="doc-header">
      <div>
        <h2>📄 文档中心</h2>
        <p class="subtitle">AI 生成与本地文件管理 {{ isElectron ? '(Electron模式)' : '(Web模式)' }}</p>
      </div>
      <div class="header-actions">
        <el-button :icon="Upload" text>导入文件</el-button>
        <el-button type="primary" :icon="Plus" @click="showNewDoc = true">新建文档</el-button>
      </div>
    </div>

    <el-row :gutter="16" class="doc-types">
      <el-col :span="8" v-for="t in docTypes" :key="t.id">
        <el-card shadow="hover" class="doc-card" @click="selectType(t.id)">
          <div class="doc-icon" :style="{ background: t.bg }">
            <el-icon :size="32" :color="t.color"><component :is="t.icon" /></el-icon>
          </div>
          <div class="doc-label">{{ t.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="recent-files">
      <template #header>
        <div class="card-header">
          <span>📁 最近文件</span>
          <el-tag size="small" type="info">{{ isElectron ? '存储于 ~/OpenClaw/' : '浏览器下载' }}</el-tag>
        </div>
      </template>
      <el-empty v-if="!recentFiles.length" description="暂无文件" />
      <div v-else class="file-list">
        <div v-for="f in recentFiles" :key="f.name" class="file-item">
          <div class="file-info">
            <el-icon :size="18" :color="f.color"><component :is="f.icon" /></el-icon>
            <div>
              <div class="file-name">{{ f.name }}</div>
              <div class="file-meta">{{ f.date }} · {{ f.size }}</div>
            </div>
          </div>
          <div class="file-actions">
            <el-button v-if="isElectron" text size="small" @click="openFile(f.name)">打开</el-button>
            <el-button text size="small">分析</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <el-dialog v-model="showNewDoc" title="新建文档" width="500px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="文档类型">
          <el-radio-group v-model="selectedType">
            <el-radio-button v-for="t in docTypes" :key="t.id" :label="t.id">
              <el-icon><component :is="t.icon" /></el-icon> {{ t.label.split(' ')[0] }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述（AI将据此生成内容）">
          <el-input v-model="docDesc" type="textarea" :rows="3" placeholder="描述文档内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewDoc = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :disabled="!selectedType">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Upload, Document, DocumentChecked, DataLine } from '@element-plus/icons-vue'
import { useLocalFiles } from '@/composables/useLocalFiles'
import { ElMessage } from 'element-plus'

const { writeFile, openFile, isElectron } = useLocalFiles()
const showNewDoc = ref(false)
const selectedType = ref('')
const docDesc = ref('')

const docTypes = [
  { id: 'ppt', label: 'PPT 演示文稿', icon: 'DocumentChecked', bg: '#fff7ed', color: '#ea580c' },
  { id: 'excel', label: 'Excel 数据表格', icon: 'DataLine', bg: '#f0fdf4', color: '#16a34a' },
  { id: 'word', label: 'Word 文档', icon: 'Document', bg: '#eff6ff', color: '#2563eb' },
]

const recentFiles = ref([
  { name: 'Q3销售报表.xlsx', type: 'excel', date: '2026-05-04', size: '45KB', icon: 'DataLine', color: '#16a34a' },
  { name: '产品介绍.pptx', type: 'ppt', date: '2026-05-03', size: '2.1MB', icon: 'DocumentChecked', color: '#ea580c' },
  { name: '会议纪要.docx', type: 'word', date: '2026-05-02', size: '12KB', icon: 'Document', color: '#2563eb' },
])

function selectType(id: string) {
  selectedType.value = id
  showNewDoc.value = true
}

async function handleCreate() {
  if (!selectedType.value) return
  const names: Record<string, string> = { ppt: '新建演示.pptx', excel: '新建表格.xlsx', word: '新建文档.docx' }
  const name = names[selectedType.value]
  try {
    await writeFile(name, 'Placeholder content')
    recentFiles.value.unshift({ name, type: selectedType.value, date: new Date().toISOString().slice(0, 10), size: '1KB', icon: 'Document', color: '#6b7280' })
    ElMessage.success(isElectron.value ? `文件已保存到 ~/OpenClaw/${name}` : '文件已触发浏览器下载')
  } catch (e) {
    ElMessage.error('保存失败')
  }
  showNewDoc.value = false
}
</script>

<style scoped>
.doc-page { height: 100%; }
.doc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.doc-header h2 { font-size: 18px; font-weight: 700; }
.subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
.header-actions { display: flex; gap: 8px; }
.doc-types { margin-bottom: 20px; }
.doc-card { cursor: pointer; text-align: center; transition: all .2s; }
.doc-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.08); }
.doc-icon { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
.doc-label { font-size: 14px; font-weight: 500; color: #374151; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.file-list { display: flex; flex-direction: column; gap: 8px; }
.file-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; transition: background .2s; }
.file-item:hover { background: #f9fafb; }
.file-info { display: flex; align-items: center; gap: 12px; }
.file-name { font-size: 14px; font-weight: 500; color: #111827; }
.file-meta { font-size: 12px; color: #9ca3af; }
.file-actions { display: flex; gap: 4px; }
</style>
