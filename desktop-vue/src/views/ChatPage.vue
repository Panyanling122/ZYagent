<template>
  <div class="chat-page">
    <div class="chat-header">
      <h2>💬 对话</h2>
      <el-tag :type="wsConnected ? 'success' : 'danger'" size="small">
        {{ wsConnected ? '已连接' : '断开' }}
      </el-tag>
    </div>
    <div class="chat-body" ref="scrollRef">
      <div v-if="!chatStore.messages.length" class="empty-chat">
        <el-icon :size="48"><ChatDotRound /></el-icon>
        <p>开始与智能体对话</p>
      </div>
      <template v-for="msg in chatStore.messages" :key="msg.id">
        <div :class="['msg-row', msg.role]">
          <div class="msg-bubble">{{ msg.content }}</div>
        </div>
        <AwaitHumanCard
          v-if="msg.awaitingHuman"
          :task-id="msg.awaitingHuman.taskId"
          :question="msg.awaitingHuman.question"
        />
      </template>
    </div>
    <div class="chat-input">
      <el-input
        v-model="input"
        placeholder="输入消息..."
        size="large"
        @keyup.enter="send"
      >
        <template #append>
          <el-button type="primary" @click="send"><el-icon><Promotion /></el-icon></el-button>
        </template>
      </el-input>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ChatDotRound, Promotion } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chatStore'
import AwaitHumanCard from '@/components/AwaitHumanCard.vue'

const chatStore = useChatStore()
const input = ref('')
const scrollRef = ref<HTMLElement>()
const wsConnected = ref(true)

function send() {
  if (!input.value.trim()) return
  chatStore.sendViaWS(input.value.trim())
  input.value = ''
}

watch(() => chatStore.messages.length, () => {
  nextTick(() => scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' }))
})
</script>

<style scoped>
.chat-page { height: 100%; display: flex; flex-direction: column; }
.chat-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; margin-bottom: 12px; }
.chat-header h2 { font-size: 18px; font-weight: 700; }
.chat-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.empty-chat { text-align: center; color: #9ca3af; margin-top: 60px; }
.msg-row { display: flex; }
.msg-row.user { justify-content: flex-end; }
.msg-bubble { max-width: 75%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.5; }
.msg-row.user .msg-bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 2px; }
.msg-row.assistant .msg-bubble { background: #f3f4f6; color: #374151; border-bottom-left-radius: 2px; }
.chat-input { padding: 12px; border-top: 1px solid #e5e7eb; }
</style>
