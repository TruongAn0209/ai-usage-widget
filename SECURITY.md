# Security policy

## Report a vulnerability

Please use **Security → Report a vulnerability** in this repository. Do not open a public issue
containing credentials, transcripts, account details or private screenshots.

Include the app version, operating system, reproduction steps and redacted logs. Never attach
`auth.json`, `.credentials.json`, `.env`, Keychain exports or real access/refresh tokens.

## Security model

- Renderer windows use context isolation, sandboxing and disabled Node integration.
- Windows cannot open arbitrary new pages; navigation is denied.
- Sensitive IPC mutations validate the sending local page and sanitize settings.
- Credentials stay in the main process and are not exposed through the preload bridge.
- The repository’s public-safety check blocks common credential formats and personal paths.
- CI tests Windows and macOS independently and runs dependency audits.

Provider usage endpoints can change without notice. A provider error must stay isolated and must
never cause credentials to be logged or sent to an alternate service.

## Supported versions

Security fixes target the latest GitHub Release. Older unsigned test builds are not supported.
