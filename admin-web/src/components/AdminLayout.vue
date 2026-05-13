<template>
  <el-container class="admin-layout">
    <el-aside width="220px" class="sidebar">
      <div class="brand">
        <el-avatar :size="32" :icon="Grid" style="background:#2563eb" />
        <span class="brand-text">OpenClaw Admin</span>
      </div>
      <el-menu :default-active="$route.path" router class="admin-menu" background-color="#1e293b" text-color="#94a3b8" active-text-color="#fff">
        <el-menu-item index="/">
          <el-icon><Odometer /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/souls">
          <el-icon><Cpu /></el-icon>
          <span>Soul 管理</span>
        </el-menu-item>
        <el-menu-item index="/workspaces">
          <el-icon><OfficeBuilding /></el-icon>
          <span>工作空间</span>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><List /></el-icon>
          <span>任务管理</span>
        </el-menu-item>
        <el-menu-item index="/memories">
          <el-icon><Collection /></el-icon>
          <span>记忆管理</span>
        </el-menu-item>
        <el-menu-item index="/groups">
          <el-icon><ChatDotRound /></el-icon>
          <span>群管理</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><Document /></el-icon>
          <span>审计日志</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <span>👤 {{ authStore.user?.username || 'Admin' }}</span>
        <el-button text size="small" @click="handleLogout">退出</el-button>
      </div>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <div class="breadcrumb">
          <el-icon><HomeFilled /></el-icon>
          <span>{{ $route.meta?.title || '管理后台' }}</span>
        </div>
        <div class="topbar-right">
          <el-tag v-if="authStore.isAdmin" type="danger" effect="dark">管理员</el-tag>
          <el-tag v-else type="info">普通用户</el-tag>
        </div>
      </el-header>
      <el-main class="main-content">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Grid, Odometer, User, Cpu, OfficeBuilding, List, Collection, ChatDotRound, Document, Setting, HomeFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/authStore'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()

function handleLogout() {
  authStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.admin-layout { height: 100vh; }
.sidebar { background: #1e293b; display: flex; flex-direction: column; color: #fff; }
.brand { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #334155; }
.brand-text { font-weight: 700; font-size: 15px; }
.admin-menu { flex: 1; border-right: none; }
.sidebar-footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-top: 1px solid #334155; font-size: 13px; }
.topbar { display: flex; align-items: center; justify-content: space-between; background: #fff; border-bottom: 1px solid #e5e7eb; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 500; color: #374151; }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.main-content { background: #f8fafc; padding: 0; overflow: auto; }
</style>
