<template>
  <aside class="sidebar">
    <div class="brand">
      <el-avatar :size="32" :icon="Grid" style="background:#2563eb" />
      <span class="brand-text">OpenClaw</span>
    </div>

    <div class="section">
      <div class="section-title">工作空间</div>
      <div
        v-for="ws in workspaceStore.workspaces"
        :key="ws.id"
        :class="['ws-item', { active: ws.id === workspaceStore.currentId }]"
        @click="workspaceStore.setCurrent(ws.id)"
      >
        <span class="ws-icon">{{ ws.icon || '📁' }}</span>
        <span class="ws-name">{{ ws.name }}</span>
      </div>
      <el-button v-if="!workspaceStore.workspaces.length" text size="small" @click="workspaceStore.fetchWorkspaces">
        刷新
      </el-button>
    </div>

    <div class="section">
      <div class="section-title">在线 Soul</div>
      <div v-for="soul in currentSouls" :key="soul.id" class="soul-item">
        <span class="soul-dot" :style="{ background: soul.status === 'online' ? '#10b981' : '#9ca3af' }" />
        <span class="soul-name">{{ soul.name }}</span>
      </div>
    </div>

    <div class="section bottom">
      <div class="user">👤 {{ authStore.userId || '未登录' }}</div>
      <div v-if="authStore.isBound" class="bound">✅ 已绑定</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Grid } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const authStore = useAuthStore()
const workspaceStore = useWorkspaceStore()

const currentSouls = computed(() => {
  const ws = workspaceStore.workspaces.find(w => w.id === workspaceStore.currentId)
  return ws?.souls || [
    { id: 's1', name: 'Soul-Alpha', status: 'online' },
    { id: 's2', name: 'Soul-Beta', status: 'online' },
    { id: 's3', name: 'Soul-Gamma', status: 'online' },
    { id: 's4', name: 'Soul-Delta', status: 'offline' },
  ]
})
</script>

<style scoped>
.sidebar { width: 200px; background: #1e293b; color: #fff; display: flex; flex-direction: column; padding: 12px; flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 8px; padding: 8px 4px 16px; border-bottom: 1px solid #334155; margin-bottom: 12px; }
.brand-text { font-weight: 700; font-size: 15px; }
.section { margin-bottom: 16px; }
.section-title { font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; padding: 0 4px; }
.ws-item, .soul-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: background .2s; }
.ws-item:hover, .ws-item.active { background: #334155; }
.ws-icon { font-size: 16px; }
.soul-dot { width: 7px; height: 7px; border-radius: 50%; }
.bottom { margin-top: auto; padding-top: 12px; border-top: 1px solid #334155; font-size: 12px; }
.user { margin-bottom: 4px; }
.bound { color: #10b981; }
</style>
