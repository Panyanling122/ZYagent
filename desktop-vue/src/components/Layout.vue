<template>
  <div class="layout">
    <Sidebar />
    <main class="main">
      <nav class="top-nav">
        <router-link to="/" :class="{ active: $route.path === '/' }">📋 看板</router-link>
        <router-link to="/chat" :class="{ active: $route.path === '/chat' }">💬 对话</router-link>
        <router-link to="/docs" :class="{ active: $route.path === '/docs' }">📄 文档</router-link>
      </nav>
      <div class="content">
        <router-view />
      </div>
    </main>
    <ChatPanel />
  </div>
</template>

<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import ChatPanel from './ChatPanel.vue'
</script>

<style scoped>
.layout { display: flex; height: 100vh; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.top-nav { display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #e5e7eb; background: #fff; }
.top-nav a { padding: 6px 16px; border-radius: 6px; font-size: 14px; color: #4b5563; text-decoration: none; transition: all .2s; }
.top-nav a:hover { background: #f3f4f6; }
.top-nav a.active { background: #2563eb; color: #fff; }
.content { flex: 1; padding: 16px; overflow: auto; background: #f9fafb; }
</style>
