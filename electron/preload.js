const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('racmp3', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectOutput: () => ipcRenderer.invoke('select-output'),
  convert: (opts) => ipcRenderer.invoke('convert', opts),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('progress', h)
    return () => ipcRenderer.removeListener('progress', h)
  }
})
