// Gia lap execFile de kiem logic ma khong can tasklist/PowerShell that va khong dung Electron.
const {
  hasClaudeProcess,
  getTerminalState,
  getClaudeCliState,
  isClaudeCliWithVisibleTerminal,
  CLAUDE_PROCESS_NAME,
} = require('../src/windowsCliWatcher');

let failed = 0;
function check(name, condition) {
  if (!condition) failed++;
  console.log(`${condition ? '✅' : '❌'} ${name}`);
}

function mockExec({ claude, terminalState = 'visible', psError = null, psOutput = null }) {
  return (file, args, _options, callback) => {
    const cmd = String(file).toLowerCase();
    if (cmd.includes('tasklist')) {
      if (claude) callback(null, `"${CLAUDE_PROCESS_NAME}","12345","Console","1","250,000 K"\n`, '');
      else callback(null, 'INFO: No tasks are running which match the specified criteria.\n', '');
      return;
    }
    if (cmd.includes('powershell')) {
      if (psError) return callback(psError, '', 'boom');
      const out = psOutput !== null ? psOutput : terminalState;
      callback(null, out + '\n', '');
      return;
    }
    callback(new Error('lệnh ngoài dự kiến: ' + file), '', '');
  };
}

async function run() {
  // ---- hasClaudeProcess -------------------------------------------------------
  check('(a) claude.exe có trong tasklist → true', await hasClaudeProcess(mockExec({ claude: true })) === true);
  check('(b) tasklist báo "No tasks" → false', await hasClaudeProcess(mockExec({ claude: false })) === false);

  // ---- getTerminalState — 3 trạng thái bắt buộc (yêu cầu 4 & 5) ---------------
  check(
    '(1) CLI đang hiện → terminal state = visible',
    (await getTerminalState(mockExec({ terminalState: 'visible' }))).state === 'visible'
  );
  check(
    '(2) terminal minimize/ẩn → terminal state = minimized',
    (await getTerminalState(mockExec({ terminalState: 'minimized' }))).state === 'minimized'
  );
  check(
    '(3) không còn terminal nào chạy (đã đóng) → terminal state = closed',
    (await getTerminalState(mockExec({ terminalState: 'closed' }))).state === 'closed'
  );

  // ---- Lỗi thực thi script KHÔNG được đoán mò thành "closed" ------------------
  check(
    '(4) PowerShell chạy lỗi → state = error (không suy diễn ẩn/hiện)',
    (await getTerminalState(mockExec({ psError: new Error('powershell not found') }))).state === 'error'
  );
  check(
    '(5) output bất ngờ (script hỏng) → state = error',
    (await getTerminalState(mockExec({ psOutput: 'huh?' }))).state === 'error'
  );

  // ---- getClaudeCliState / isClaudeCliWithVisibleTerminal ---------------------
  check(
    '(6) claude chạy + terminal hiện → true',
    (await isClaudeCliWithVisibleTerminal(mockExec({ claude: true, terminalState: 'visible' }))) === true
  );
  check(
    '(7) claude chạy + terminal minimize → false',
    (await isClaudeCliWithVisibleTerminal(mockExec({ claude: true, terminalState: 'minimized' }))) === false
  );
  check(
    '(8) claude không chạy dù terminal hiện → false',
    (await isClaudeCliWithVisibleTerminal(mockExec({ claude: false, terminalState: 'visible' }))) === false
  );

  const combined = await getClaudeCliState(mockExec({ claude: true, terminalState: 'visible' }));
  check('(9) getClaudeCliState gộp đúng cả 2 phần', combined.claude === true && combined.terminal.state === 'visible');

  if (failed) {
    console.error(`\n❌ ${failed} ca sai`);
    process.exit(1);
  }
  console.log('\n✅ tất cả đạt');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
