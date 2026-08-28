// Cầu nối cho CỬA SỔ CÀI ĐẶT — có quyền ĐỌC + GHI cấu hình. Chỉ trang settings.html mới nạp file
// này (xem `openSettings()` trong main.js) — widget nạp preload-widget.js, không có các hàm dưới.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getProviders: () => ipcRenderer.invoke('get-providers'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  resetConfig: () => ipcRenderer.invoke('reset-config'),
  refreshNow: () => ipcRenderer.invoke('refresh-now'),
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
})
