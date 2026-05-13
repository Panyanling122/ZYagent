<template>
  <teleport to="body">
    <!-- Minimized FAB -->
    <el-button
      v-if="chatStore.isMinimized"
      class="chat-fab"
      circle
      type="primary"
      size="large"
      @click="chatStore.togglePanel"
    >
      <el-icon><ChatDotRound /></el-icon>
      <el-badge v-if="chatStore.unread > 0" :value="chatStore.unread" class="chat-badge" />
    </el-button>

    <!-- Expanded Panel -->
    <div v-else class="chat-panel">
      <div class="panel-header">
        <span>💬 对话</span>
        <div class="header-actions">
          <el-button text size="small" @click="chatStore.minimize"><el-icon><Minus /></el-icon></el-button>
          <el-button text size="small" @click="chatStore.togglePanel"><el-icon><Close /></el-icon></el-button>
        </div>
      </div>

      <div class="panel-body" ref="scrollRef">
        <div v-if="!chatStore.messages.length" class="empty-chat">
          <el-icon :size="32"><ChatDotRound /></el-icon>
          <p>开始与智能体对话</p>
        </div>
        <template v-for="msg in chatStore.messages" :key="msg.id">
          <div :class="['msg-row', msg.role === 'user' ? 'user' : 'assistant']">
            <div class="msg-bubble">{{ msg.content }}</div>
          </div>
          <AwaitHumanCard
            v-if="msg.awaitingHuman"
            :task-id="msg.awaitingHuman.taskId"
            :question="msg.awaitingHuman.question"
          />
        </template>
      </div>

      <div class="panel-footer">
        <el-input
          v-model="input"
          placeholder="输入消息..."
          @keyup.enter="handleSend"
        >
          <template #append>
            <el-button @click="handleSend"><el-icon><Promotion /></el-icon></el-button>
          </template>
        </el-input>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ChatDotRound, Minus, Close, Promotion } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chatStore'
import AwaitHumanCard from './AwaitHumanCard.vue'

const chatStore = useChatStore()
const input = ref('')
const scrollRef = ref<HTMLElement>()

function handleSend() {
  if (!input.value.trim()) return
  chatStore.sendViaWS(input.value.trim())
  input.value = ''
}

watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' })
  })
})
</script>

<style scoped>
.chat-fab { position: fixed; right: 20px; bottom: 20px; width: 52px; height: 52px; z-index: 1000; }
.chat-badge :deep(.el-badge__content) { position: absolute; top: -6px; right: -6px; }
.chat-panel { position: fixed; right: 0; top: 0; bottom: 0; width: 400px; background: #fff; border-left: 1px solid #e5e7eb; display: flex; flex-direction: column; z-index: 1000; box-shadow: -4px 0 12px rgba(0,0,0,0.08); }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 14px; }
.header-actions { display: flex; gap: 4px; }
.panel-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.empty-chat { text-align: center; color: #9ca3af; margin-top: 40px; }
.msg-row { display: flex; }
.msg-row.user { justify-content: flex-end; }
.msg-bubble { max-width: 80%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-break: break-word; }
.msg-row.user .msg-bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 2px; }
.msg-row.assistant .msg-bubble { background: #f3f4f6; color: #374151; border-bottom-left-radius: 2px; }
.panel-footer { padding: 10px 12px; border-top: 1px solid #e5e7eb; }
</style>
