const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'm4a', 'wav', 'ogg']
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')

let win

function createWindow() {
  win = new BrowserWindow({
    width: 860,
    height: 620,
    minWidth: 600,
    minHeight: 460,
    backgroundColor: '#0f0f17',
    autoHideMenuBar: true,
    title: 'RacMp3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

ipcMain.handle('select-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Vidéo / Audio', extensions: VIDEO_EXT }]
  })
  return r.canceled ? [] : r.filePaths
})

ipcMain.handle('select-output', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})

const toSeconds = (h, m, s) => +h * 3600 + +m * 60 + +s

ipcMain.handle('convert', (_e, { file, outDir, bitrate }) => {
  return new Promise((resolve) => {
    const base = path.basename(file, path.extname(file))
    const out = path.join(outDir || path.dirname(file), base + '.mp3')
    const args = ['-y', '-i', file, '-vn', '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`, out]
    const p = spawn(ffmpegPath, args, { windowsHide: true })
    let duration = 0
    let log = ''
    p.stderr.on('data', (d) => {
      const s = d.toString()
      log = (log + s).slice(-2000)
      const dm = s.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (dm) duration = toSeconds(dm[1], dm[2], dm[3])
      const tm = [...s.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop()
      if (tm && duration) {
        const pct = Math.min(99, (toSeconds(tm[1], tm[2], tm[3]) / duration) * 100)
        win.webContents.send('progress', { file, pct })
      }
    })
    p.on('error', (err) => resolve({ ok: false, error: err.message }))
    p.on('close', (code) =>
      resolve(code === 0 ? { ok: true, out } : { ok: false, error: log.split('\n').slice(-3).join(' ') })
    )
  })
})

ipcMain.handle('show-in-folder', (_e, p) => require('electron').shell.showItemInFolder(p))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
