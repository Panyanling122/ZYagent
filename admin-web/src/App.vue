<template>
  <router-view />
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.el-menu { border-right: none !important; }
.page-container { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { font-size: 20px; font-weight: 600; color: #1f2937; }
.stat-card { text-align: center; padding: 16px; }
.stat-value { font-size: 28px; font-weight: 700; color: #2563eb; }
.stat-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
</style>
