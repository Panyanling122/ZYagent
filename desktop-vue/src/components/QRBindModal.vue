<template>
  <el-dialog v-model="visible" title="📱 绑定微信账号" width="420px" :close-on-click-modal="false" destroy-on-close>
    <div v-if="isCreating" class="bind-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>生成绑定口令...</span>
    </div>
    <div v-else class="bind-body">
      <div class="qr-area">
        <div class="qr-placeholder">
          <el-icon :size="48"><Camera /></el-icon>
          <div class="token-text">{{ token.slice(0, 16) }}...</div>
        </div>
        <div :class="['status-text', bindStatus]">{{ statusLabel }}</div>
      </div>

      <div class="bind-steps">
        <p>1. 打开微信，进入 ClawBot 聊天窗口</p>
        <p>2. 发送消息：<code>绑定OpenClaw:{{ token.slice(0, 16) }}...</code></p>
        <p>3. 收到确认回复即完成绑定</p>
      </div>

      <div class="bind-actions">
        <el-button :icon="copied ? Check : CopyDocument" @click="handleCopy" :disabled="bindStatus !== 'pending'">
          {{ copied ? '已复制' : '复制绑定口令' }}
        </el-button>
        <span :class="['timer', timeLeft < 60 ? 'urgent' : '']">⏱ {{ formatTime }}</span>
      </div>
    </div>

    <template #footer>
      <el-button text @click="handleSkip">稍后再说</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Camera, CopyDocument, Check, Loading } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/api/client'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const authStore = useAuthStore()
const token = ref('')
const copied = ref(false)
const timeLeft = ref(600)
const bindStatus = ref<'pending' | 'bound' | 'expired'>('pending')
const isCreating = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function genToken(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

function cleanup() {
  if (timer) clearInterval(timer)
  if (pollTimer) clearInterval(pollTimer)
}

async function init() {
  cleanup()
  isCreating.value = true
  bindStatus.value = 'pending'
  timeLeft.value = 600
  copied.value = false

  try {
    const res = await api.ilink.createBindToken()
    token.value = res.token || genToken()
    timeLeft.value = res.expiresIn || 600
  } catch {
    token.value = genToken()
  }
  isCreating.value = false

  timer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) { cleanup(); bindStatus.value = 'expired'; }
  }, 1000)

  pollTimer = setInterval(async () => {
    try {
      const status = await api.ilink.checkBindStatus(token.value)
      if (status.status === 'bound') {
        cleanup()
        bindStatus.value = 'bound'
        authStore.setBound(true)
        setTimeout(() => visible.value = false, 1500)
      }
    } catch { /* ignore */ }
  }, 3000)
}

watch(visible, (v) => { if (v) init(); else cleanup(); })
onUnmounted(cleanup)

const formatTime = computed(() => {
  const m = Math.floor(timeLeft.value / 60)
  const s = timeLeft.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const statusLabel = computed(() => ({
  pending: '等待微信扫描...',
  bound: '✅ 绑定成功！',
  expired: '⏰ 绑定口令已过期',
})[bindStatus.value])

function handleCopy() {
  navigator.clipboard.writeText(`绑定OpenClaw:${token.value}`)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

function handleSkip() {
  cleanup()
  authStore.setSkipped()
  visible.value = false
}
</script>

<style scoped>
.bind-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 32px; color: #6b7280; }
.bind-body { text-align: center; }
.qr-area { background: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.qr-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9ca3af; margin-bottom: 8px; }
.token-text { font-family: monospace; font-size: 12px; color: #6b7280; }
.status-text { font-size: 14px; font-weight: 500; }
.status-text.pending { color: #2563eb; }
.status-text.bound { color: #16a34a; }
.status-text.expired { color: #dc2626; }
.bind-steps { text-align: left; font-size: 13px; color: #4b5563; line-height: 2; margin-bottom: 16px; padding: 0 8px; }
.bind-steps code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.bind-actions { display: flex; align-items: center; justify-content: space-between; padding: 0 8px; }
.timer { font-size: 14px; color: #6b7280; }
.timer.urgent { color: #dc2626; font-weight: 600; }
</style>
