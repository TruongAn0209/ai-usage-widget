const { decideFollowClaudeCli } = require('../src/followClaudeCliDecision');

let failed = 0;
function check(name, condition) {
  if (!condition) failed++;
  console.log(`${condition ? '✅' : '❌'} ${name}`);
}

// ---- 3 trạng thái bắt buộc theo yêu cầu (mục 2 & 5) --------------------------
// (1) CLI đang hiện → widget hiện
check(
  '(1) claude chạy + terminal visible, đang bị watcher ẩn → hiện lại',
  (() => {
    const d = decideFollowClaudeCli({
      followClaudeCli: true,
      claude: true,
      terminalState: 'visible',
      isVisible: false,
      autoHiddenByWatcher: true,
    });
    return d.action === 'show' && d.autoHiddenByWatcher === false;
  })()
);

// (2) terminal/CLI minimize hoặc ẩn → widget ẩn
check(
  '(2) terminal minimized, widget đang hiện → ẩn + đánh dấu do watcher',
  (() => {
    const d = decideFollowClaudeCli({
      followClaudeCli: true,
      claude: true,
      terminalState: 'minimized',
      isVisible: true,
      autoHiddenByWatcher: false,
    });
    return d.action === 'hide' && d.autoHiddenByWatcher === true;
  })()
);

// (3) restore terminal/CLI → widget hiện lại
check(
  '(3) restore: terminal quay lại visible sau khi watcher đã ẩn → hiện lại',
  (() => {
    const d = decideFollowClaudeCli({
      followClaudeCli: true,
      claude: true,
      terminalState: 'visible',
      isVisible: false,
      autoHiddenByWatcher: true,
    });
    return d.action === 'show' && d.autoHiddenByWatcher === false;
  })()
);

// ---- Không vòng lặp ẩn/hiện ---------------------------------------------------
check(
  '(4) đã hiện đúng rồi (không phải do watcher ẩn trước đó) → không làm gì',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: true,
    terminalState: 'visible',
    isVisible: true,
    autoHiddenByWatcher: false,
  }).action === 'none'
);
check(
  '(5) đã ẩn đúng rồi → không gọi hide lặp lại',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: true,
    terminalState: 'minimized',
    isVisible: false,
    autoHiddenByWatcher: true,
  }).action === 'none'
);

// ---- Ẩn thủ công bằng hotkey không bị tự động hiện lại ngoài ý muốn ----------
check(
  '(6) An tự ẩn bằng hotkey TRONG CÙNG phiên Claude đang chạy → KHÔNG tự hiện lại',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: true,
    terminalState: 'visible',
    isVisible: false,
    autoHiddenByWatcher: false,
    wasActiveBefore: true,
  }).action === 'none'
);

// ---- Ẩn tay không được "dính" vĩnh viễn qua một chu kỳ đóng/mở Claude --------
check(
  '(6b) An tự ẩn bằng hotkey, sau đó Claude tắt rồi mở lại → widget PHẢI tự hiện lại',
  (() => {
    const d = decideFollowClaudeCli({
      followClaudeCli: true,
      claude: true,
      terminalState: 'visible',
      isVisible: false,
      autoHiddenByWatcher: false,
      wasActiveBefore: false, // lần kiểm tra trước Claude không hoạt động -> lần này là mở lại
    });
    return d.action === 'show' && d.autoHiddenByWatcher === false && d.activeNow === true;
  })()
);

// ---- claude không chạy → ẩn dù terminal đang hiện -----------------------------
check(
  '(7) claude.exe không chạy, terminal hiện, widget đang hiện → ẩn',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: false,
    terminalState: 'visible',
    isVisible: true,
    autoHiddenByWatcher: false,
  }).action === 'hide'
);

// ---- terminal đã đóng hẳn -----------------------------------------------------
check(
  '(8) terminal đã đóng, widget đang hiện → ẩn',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: true,
    terminalState: 'closed',
    isVisible: true,
    autoHiddenByWatcher: false,
  }).action === 'hide'
);

// ---- Script đo lỗi (không phải "đã đóng" thật) → không đoán mò ---------------
check(
  '(9) terminalState = error → không hành động gì, giữ nguyên hiện trạng',
  decideFollowClaudeCli({
    followClaudeCli: true,
    claude: true,
    terminalState: 'error',
    isVisible: true,
    autoHiddenByWatcher: false,
  }).action === 'none'
);

// ---- Tắt tính năng trả widget về bình thường ---------------------------------
check(
  '(10) tắt followClaudeCli trong lúc đang bị watcher ẩn → trả lại hiện',
  (() => {
    const d = decideFollowClaudeCli({
      followClaudeCli: false,
      claude: false,
      terminalState: 'closed',
      isVisible: false,
      autoHiddenByWatcher: true,
    });
    return d.action === 'show' && d.autoHiddenByWatcher === false;
  })()
);
check(
  '(11) tắt followClaudeCli, widget vốn đã hiện (không do watcher) → không làm gì',
  decideFollowClaudeCli({
    followClaudeCli: false,
    claude: false,
    terminalState: 'closed',
    isVisible: true,
    autoHiddenByWatcher: false,
  }).action === 'none'
);

if (failed) {
  console.error(`\n❌ ${failed} ca sai`);
  process.exit(1);
}
console.log('\n✅ tất cả đạt');
