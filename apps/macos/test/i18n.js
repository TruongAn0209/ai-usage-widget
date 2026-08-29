// Test thuần Node cho i18n.js — không đụng Electron.
const assert = require('assert')
const { getStrings, resolveLang, translateError, fmt, DICTS } = require('../src/i18n')

function check(label, cond) {
  if (!cond) throw new Error('FAIL: ' + label)
  console.log('✅ ' + label)
}

check('resolveLang: đặt tay vi thắng mọi locale', resolveLang('vi', 'en-US') === 'vi')
check('resolveLang: đặt tay en thắng mọi locale', resolveLang('en', 'vi-VN') === 'en')
check('resolveLang: auto + locale vi-VN → vi', resolveLang('auto', 'vi-VN') === 'vi')
check('resolveLang: auto + locale en-US → en', resolveLang('auto', 'en-US') === 'en')
check('resolveLang: auto + locale lạ (fr-FR) → en (mặc định)', resolveLang('auto', 'fr-FR') === 'en')
check('resolveLang: thiếu locale → en', resolveLang('auto', undefined) === 'en')

check('getStrings trả đúng dict vi', getStrings('vi', 'en-US').appTitle === 'AI Usage')
check('getStrings trả đúng dict en', getStrings('en', 'vi-VN').loading === 'Loading…')

// Mọi khoá trong vi phải có mặt trong en và ngược lại — lệch khoá là lộ ra chuỗi "undefined" trên UI.
const viKeys = Object.keys(DICTS.vi).sort()
const enKeys = Object.keys(DICTS.en).sort()
check('vi và en có ĐÚNG cùng một bộ khoá', JSON.stringify(viKeys) === JSON.stringify(enKeys))

check('fmt: thay đúng token', fmt('còn {h}h{m}', { h: 1, m: '05' }) === 'còn 1h05')
check('fmt: token thiếu trong vars thì giữ nguyên placeholder', fmt('{a}-{b}', { a: 'x' }) === 'x-{b}')

check('translateError: mã đã biết dịch đúng', translateError('EXPIRED', DICTS.vi) === DICTS.vi.errExpired)
check('translateError: mã lạ rơi về errOther kèm mã gốc', translateError('WHATEVER_123', DICTS.en) === 'Error: WHATEVER_123')
check('translateError: mã rỗng/undefined không throw', translateError(undefined, DICTS.vi) === DICTS.vi.errOther + ': ?')

console.log('✅ tất cả đạt')
