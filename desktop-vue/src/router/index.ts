import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'
import ChatPage from '@/views/ChatPage.vue'
import DocumentPage from '@/views/DocumentPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/chat', component: ChatPage },
    { path: '/docs', component: DocumentPage },
  ],
})

export default router
