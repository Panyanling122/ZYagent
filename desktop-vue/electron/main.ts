import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron'
import path from 'path'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600, center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('show-notification', (_, title: string, body: string) => {
  new Notification({ title, body }).show()
})
ipcMain.handle('write-local-file', async (_, fp: string, content: string) => {
  const fs = await import('fs'); const os = await import('os')
  const full = path.join(os.homedir(), 'OpenClaw', fp)
  await fs.promises.mkdir(path.dirname(full), { recursive: true })
  await fs.promises.writeFile(full, content, 'utf-8')
})
ipcMain.handle('read-local-file', async (_, fp: string) => {
  const fs = await import('fs'); const os = await import('os')
  return fs.promises.readFile(path.join(os.homedir(), 'OpenClaw', fp), 'utf-8')
})
ipcMain.handle('open-with-default-app', async (_, fp: string) => {
  const os = await import('os')
  shell.openPath(path.join(os.homedir(), 'OpenClaw', fp))
})
ipcMain.handle('get-local-files', async (_, dir: string) => {
  const fs = await import('fs'); const os = await import('os')
  const full = path.join(os.homedir(), 'OpenClaw', dir)
  if (!fs.existsSync(full)) return []
  return fs.promises.readdir(full)
})
