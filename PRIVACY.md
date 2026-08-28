# Privacy

AI Usage Widget has no intermediary backend, user account, advertising SDK or behavioral analytics.

## Local data the app reads

Depending on the enabled provider and operating system, the app may read:

- Claude Code OAuth from its credential file or macOS Keychain.
- Claude Desktop/IDE daily token counts and recent usage history from its Application Support data.
- Claude Code transcripts under `~/.claude/projects/` for local context and daily activity.
- GPT Plus/Codex OAuth from `~/.codex/auth.json`.
- Grok and Gemini CLI credential stores.
- Antigravity usage from a running local `agy` process on `127.0.0.1`.
- An OpenRouter key from the environment or the dedicated widget configuration described in each app.

Credentials remain in the Electron main process. They are never sent to the renderer, notifications,
logs, exported widget settings or this project’s maintainers.

## Network connections

The app sends each credential only to the provider that issued it, and only to retrieve account
usage information. Supported destinations are Anthropic, ChatGPT/OpenAI, Google, xAI and
OpenRouter. Antigravity communication stays on the local loopback interface.

Provider usage endpoints may be undocumented and can change without notice.

## Credential refresh behavior

The macOS build is read-only and does not rotate provider credentials. Some providers in the
Windows build can use the provider’s official OAuth refresh endpoint when a local access token has
expired; a rotated token is written atomically back to the same local credential store. The app
does not copy that token anywhere else.

## Data the app writes

The app writes display preferences and a short-lived Antigravity usage snapshot to its own
Application Support/AppData directory. Uninstalling the executable may not remove this directory.

The app does not alter local AI transcripts.

## Delete widget data

Quit the app, then remove only the widget directory:

- Windows: `%APPDATA%\ai-usage-widget` or the path shown by the app.
- macOS: `~/Library/Application Support/ai-usage-widget-mac`.

This does not remove login data owned by any AI CLI or IDE.
