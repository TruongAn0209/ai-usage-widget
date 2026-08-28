// Script kiem tra THAT tren may Windows dang chay — khong mock gi ca, goi thang tasklist.exe va
// powershell.exe that. Dung de người dùng tự xac nhan ca 3 trang thai:
//   1) mo Windows Terminal (dang chay claude) binh thuong           -> claude=true, terminal=visible
//   2) thu nho (minimize) cua so Windows Terminal do                -> terminal=minimized
//   3) phuc hoi (click lai vao taskbar)                             -> terminal=visible
//
// Chay: node test/windows-cli-watcher-live.js           (in 1 lan)
//       node test/windows-cli-watcher-live.js --watch   (in moi 2 giay, Ctrl+C de dung —
//                                                          thu minimize/restore terminal trong luc no chay)
const { getClaudeCliState } = require('../src/windowsCliWatcher');

async function printOnce() {
  const status = await getClaudeCliState();
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(
    `[${time}] claude.exe chạy: ${status.claude ? 'CÓ' : 'không'} · terminal: ${status.terminal.state}` +
      (status.terminal.error ? ` (lỗi: ${status.terminal.error.message})` : '')
  );
}

async function main() {
  const watch = process.argv.includes('--watch');
  if (!watch) {
    await printOnce();
    return;
  }
  console.log('Đang theo dõi mỗi 2 giây — thử minimize rồi restore cửa sổ Windows Terminal. Ctrl+C để dừng.\n');
  await printOnce();
  setInterval(printOnce, 2000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
