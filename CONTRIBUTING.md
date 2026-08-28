# Contributing

Focused bug reports and pull requests are welcome.

## Requirements

- Node.js 22.12 or newer.
- npm.
- macOS for the macOS app, or Windows for full Windows integration testing.

## Setup

```bash
cd apps/macos   # or apps/windows
npm ci
npm test
npm start
```

Before opening a pull request:

1. Never add real tokens, credential files, transcripts, logs or personal filesystem paths.
2. Keep provider failures isolated and validate all disk/network data.
3. Keep credentials out of renderer processes.
4. Add a regression test for the behavior changed.
5. Run `npm audit --audit-level=high`, `npm test` and `node ../../scripts/public-check.js`.
6. Update privacy documentation if a new file, credential store or network destination is used.

The Windows UI is Vietnamese/English. Keep labels short enough for the compact layouts.
