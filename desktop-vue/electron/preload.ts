import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (t: string, b: string) => ipcRenderer.invoke('show-notification', t, b),
  writeLocalFile: (p: string, c: string) => ipcRenderer.invoke('write-local-file', p, c),
  readLocalFile: (p: string) => ipcRenderer.invoke('read-local-file', p),
  openWithDefaultApp: (p: string) => ipcRenderer.invoke('open-with-default-app', p),
  getLocalFiles: (d: string) => ipcRenderer.invoke('get-local-files', d),
})
