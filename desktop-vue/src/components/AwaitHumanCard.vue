<template>
  <div class="await-card">
    <div class="await-title">🟡 需要人工确认</div>
    <div class="await-question">{{ question }}</div>
    <div class="await-actions">
      <el-button v-for="opt in options" :key="opt" size="small" type="primary" @click="respond(opt)">
        {{ opt }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/chatStore'

const props = defineProps<{
  taskId: string
  question: string
  options?: string[]
}>()

const chatStore = useChatStore()
const options = props.options || ['同意', '拒绝', '修改']

function respond(opt: string) {
  chatStore.respondToTask(props.taskId, opt)
}
</script>

<style scoped>
.await-card { background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 12px; }
.await-title { font-size: 13px; font-weight: 600; color: #854d0e; margin-bottom: 6px; }
.await-question { font-size: 13px; color: #713f12; margin-bottom: 10px; }
.await-actions { display: flex; gap: 8px; }
</style>
