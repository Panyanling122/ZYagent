import { ref } from 'vue'

function getIsElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI
}

export function useLocalFiles() {
  const isElectron = ref(getIsElectron())

  async function writeFile(path: string, content: string) {
    if (isElectron.value) {
      return (window as any).electronAPI.writeLocalFile(path, content)
    }
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() || 'file'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function readFile(path: string): Promise<string> {
    if (isElectron.value) {
      return (window as any).electronAPI.readLocalFile(path)
    }
    return ''
  }

  async function openFile(path: string) {
    if (isElectron.value) {
      return (window as any).electronAPI.openWithDefaultApp(path)
    }
  }

  async function getFiles(dir: string): Promise<string[]> {
    if (isElectron.value) {
      return (window as any).electronAPI.getLocalFiles(dir)
    }
    return []
  }

  async function notify(title: string, body: string) {
    if (isElectron.value) {
      return (window as any).electronAPI.showNotification(title, body)
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }

  return { writeFile, readFile, openFile, getFiles, notify, isElectron }
}
