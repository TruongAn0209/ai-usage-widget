const { spawnSync } = require('child_process')
const path = require('path')

if (process.env.RUN_ELECTRON_GUI_TESTS !== '1') {
  console.log('✅ Bỏ qua smoke GUI trong môi trường headless; đặt RUN_ELECTRON_GUI_TESTS=1 để chạy.')
  process.exit(0)
}

const electron = require('electron')
const result = spawnSync(electron, [path.join(__dirname, 'smoke.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_DISABLE_GPU: '1' },
})
if (result.error) throw result.error
process.exit(result.status === null ? 1 : result.status)
