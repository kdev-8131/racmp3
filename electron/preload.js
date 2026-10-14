const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('racmp3', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectOutput: () => ipcRenderer.invoke('select-output'),
  fileInfo: (files) => ipcRenderer.invoke('file-info', files),
  convert: (opts) => ipcRenderer.invoke('convert', opts),
  cancel: () => ipcRenderer.invoke('cancel'),
  taskbarProgress: (v) => ipcRenderer.invoke('taskbar-progress', v),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (cb) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('progress', h)
    return () => ipcRenderer.removeListener('progress', h)
  }
})
