// Chụp ảnh THẬT của widget cho từng bố cục, bằng dữ liệu THẬT lấy từ provider + transcript.
//   chạy: npx electron test/shot.js [thư-mục-lưu]
//
// Vì sao không dùng `screencapture` của macOS: nếu Terminal chưa được cấp quyền Screen Recording
// thì nó chỉ chụp ra hình nền, không có cửa sổ nào — nhìn tưởng widget không chạy. `capturePage()`
// chụp ngay trong tiến trình nên không phụ thuộc quyền đó.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

const providers = require('../src/providers')
const tracker = require('../src/usageTracker')

const OUT = process.argv[2] || path.join(__dirname, '..', 'dist', 'shots')
const R = path.join(__dirname, '..', 'src', 'renderer')
const LAYOUTS = ['bars', 'rings', 'strip', 'dashboard', 'terminal']
const WIDTH_BONUS = { dashboard: 190, strip: 110 }

const errors = []
let height = 240
ipcMain.on('content-height', (_e, h) => { height = Math.max(80, Math.round(h)) })

// Chốt chặn: treo thì phải CHẾT và nói ra, không nằm im chiếm máy.
setTimeout(() => { console.log('❌ QUÁ 90 GIÂY — treo ở đâu đó'); app.exit(2) }, 90000)

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const list = await providers.fetchAll([])
  const context = await tracker.readContext('1000000')
  const today = await tracker.todayStats('1000000')
  console.log('dữ liệu thật:', list.map((p) => p.ok ? `${p.name}(${p.metrics.length} mục)` : `${p.name}=lỗi ${p.error}`).join(' · '))

  // ★ PHẢI hiện cửa sổ ra: cửa sổ `show:false` trên macOS không vẽ, `capturePage()` treo vô hạn
  //   (đã vấp). Dùng `showInactive()` để nó không cướp focus người dùng.
  // ★ DÙNG LẠI MỘT cửa sổ cho cả 5 bố cục: tạo rồi destroy liên tiếp thì cửa sổ thứ 2 nạp file
  //   local trả ERR_FAILED và tiến trình con chết theo (cũng đã vấp).
  let currentLayout = 'bars'
  const w = new BrowserWindow({
    show: false, transparent: true, frame: false, skipTaskbar: true, x: 40, y: 60,
    width: 260, height: 300,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  })
  w.webContents.on('console-message', (_e, lv, msg) => { if (lv >= 2) errors.push(`[${currentLayout}] ${msg}`) })
  await w.loadFile(path.join(R, 'index.html'))
  w.showInactive()

  for (const layout of LAYOUTS) {
    currentLayout = layout
    height = 240
    w.setContentSize(260 + (WIDTH_BONUS[layout] || 0), 300)
    w.webContents.send('usage-data', {
      providers: list, context, today, forecasts: {},
      config: { palette: 'espresso', layout, opacity: 1, hoverBoost: true, showContext: true, showForecast: true },
    })
    await new Promise((r) => setTimeout(r, 900))
    w.setContentSize(260 + (WIDTH_BONUS[layout] || 0), height)   // khít nội dung như lúc chạy thật
    await new Promise((r) => setTimeout(r, 400))
    const img = await w.webContents.capturePage()
    const file = path.join(OUT, `${layout}.png`)
    fs.writeFileSync(file, img.toPNG())
    console.log(`✅ ${layout} → ${file} (${img.getSize().width}x${img.getSize().height})`)
  }
  w.destroy()

  console.log(errors.length ? '❌ LỖI CONSOLE:\n' + errors.join('\n') : '✅ không có lỗi console')
  app.exit(errors.length ? 1 : 0)
})
