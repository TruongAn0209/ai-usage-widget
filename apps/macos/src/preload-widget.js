// Cầu nối cho CỬA SỔ WIDGET — CHỈ ĐỌC + làm mới, KHÔNG có quyền đổi cấu hình.
// ★ Mục 15 (bảo mật, codex soi ra 02/08): trước đây widget và trang Cài đặt dùng CHUNG một
//   preload.js có cả `setConfig`/`resetConfig`/`exportConfig`/`importConfig` — widget vốn không
//   bao giờ cần các quyền đó, nhưng nếu widget có lỗ hổng renderer (XSS qua nội dung lạ nào đó)
//   thì kẻ tấn công cũng có sẵn API ghi cấu hình trong tay. Tách riêng để widget vật lý KHÔNG THỂ
//   gọi các hàm ghi, dù renderer của nó có bị chiếm cũng vậy (bề mặt tấn công nhỏ nhất có thể).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  onData: (cb) => ipcRenderer.on('usage-data', (_e, data) => cb(data)),
  reportHeight: (h) => ipcRenderer.send('content-height', h),
  refreshNow: () => ipcRenderer.invoke('refresh-now'),
  openSettings: () => ipcRenderer.send('open-settings'),
})
