<template>
  <Layout />
  <QRBindModal v-model="showBind" />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/composables/useWebSocket'
import Layout from '@/components/Layout.vue'
import QRBindModal from '@/components/QRBindModal.vue'

const authStore = useAuthStore()
const showBind = ref(false)

useWebSocket()

onMounted(async () => {
  const bound = await authStore.checkBound()
  if (!bound) showBind.value = true
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
</style>
