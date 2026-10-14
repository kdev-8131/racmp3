const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'flv', 'wmv', 'm4a', 'wav', 'ogg']
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')

let win
let current = null // { proc, cancelled }

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 640,
    minHeight: 520,
    backgroundColor: '#0f0f17',
    autoHideMenuBar: true,
    title: 'RacMp3',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

const sizeOf = (f) => {
  try {
    return fs.statSync(f).size
  } catch {
    return 0
  }
}

// Evite d'ecraser un MP3 existant : "nom.mp3", "nom (1).mp3", ...
function uniqueOut(dir, base) {
  let out = path.join(dir, base + '.mp3')
  for (let n = 1; fs.existsSync(out); n++) out = path.join(dir, `${base} (${n}).mp3`)
  return out
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

ipcMain.handle('file-info', (_e, files) => files.map((f) => ({ file: f, size: sizeOf(f) })))

const toSeconds = (h, m, s) => +h * 3600 + +m * 60 + +s

ipcMain.handle('convert', (_e, { file, outDir, bitrate }) => {
  return new Promise((resolve) => {
    const base = path.basename(file, path.extname(file))
    const out = uniqueOut(outDir || path.dirname(file), base)
    const args = ['-y', '-i', file, '-vn', '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`, out]
    const proc = spawn(ffmpegPath, args, { windowsHide: true })
    current = { proc, cancelled: false }
    const job = current
    let duration = 0
    let log = ''
    proc.stderr.on('data', (d) => {
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
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) => {
      current = null
      if (job.cancelled) {
        fs.rmSync(out, { force: true })
        return resolve({ ok: false, cancelled: true })
      }
      if (code === 0) return resolve({ ok: true, out, size: sizeOf(out) })
      fs.rmSync(out, { force: true })
      const hint = /Invalid data|moov atom|does not contain any stream|Stream map/i.test(log)
        ? "Ce fichier est illisible ou ne contient pas de piste audio."
        : log.split('\n').filter(Boolean).slice(-2).join(' ')
      resolve({ ok: false, error: hint })
    })
  })
})

ipcMain.handle('cancel', () => {
  if (current) {
    current.cancelled = true
    current.proc.kill()
  }
})

ipcMain.handle('taskbar-progress', (_e, v) => win && win.setProgressBar(v))
ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p))
ipcMain.handle('open-folder', (_e, p) => shell.openPath(p))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
