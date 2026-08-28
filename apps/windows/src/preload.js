const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeUsage', {
  // Widget chinh
  onConfig: (cb) => ipcRenderer.on('config', (_e, data) => cb(data)),
  onUpdate: (cb) => ipcRenderer.on('usage-update', (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('usage-error', (_e, msg) => cb(msg)),
  toggleExpand: (value) => ipcRenderer.send('toggle-expand', value),
  reportHeight: (h) => ipcRenderer.send('content-height', h),
  refreshNow: () => ipcRenderer.send('refresh-now'),
  openSettings: () => ipcRenderer.send('open-settings'),
  close: () => ipcRenderer.send('close-window'),

  // Cua so cai dat
  onSettingsData: (cb) => ipcRenderer.on('settings-data', (_e, data) => cb(data)),
  saveSettings: (payload) => ipcRenderer.send('save-settings', payload),
  resetSettings: () => ipcRenderer.send('reset-settings'),
});
