import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Login from '@/views/Login.vue'
import Dashboard from '@/views/Dashboard.vue'
import UserManage from '@/views/UserManage.vue'
import SoulManage from '@/views/SoulManage.vue'
import WorkspaceManage from '@/views/WorkspaceManage.vue'
import TaskManage from '@/views/TaskManage.vue'
import MemoryManage from '@/views/MemoryManage.vue'
import GroupManage from '@/views/GroupManage.vue'
import AuditLog from '@/views/AuditLog.vue'
import SystemSettings from '@/views/SystemSettings.vue'

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/', component: Dashboard, meta: { title: '概览' } },
  { path: '/users', component: UserManage, meta: { title: '用户管理' } },
  { path: '/souls', component: SoulManage, meta: { title: 'Soul 管理' } },
  { path: '/workspaces', component: WorkspaceManage, meta: { title: '工作空间' } },
  { path: '/tasks', component: TaskManage, meta: { title: '任务管理' } },
  { path: '/memories', component: MemoryManage, meta: { title: '记忆管理' } },
  { path: '/groups', component: GroupManage, meta: { title: '群管理' } },
  { path: '/audit', component: AuditLog, meta: { title: '审计日志' } },
  { path: '/settings', component: SystemSettings, meta: { title: '系统设置' } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (!to.meta?.public && !authStore.token) {
    next('/login')
  } else {
    next()
  }
})

export default router
