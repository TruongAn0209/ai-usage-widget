# Publishing

Tagged releases are built by `.github/workflows/release.yml` on native Windows and macOS runners.
GitHub Pages is deployed independently from `site/`.

## Before tagging

```bash
node scripts/public-check.js
cd apps/macos && npm ci && npm audit --audit-level=high && npm test
cd ../windows && npm ci && npm audit --audit-level=high && npm test
```

Also verify:

- No remote points to an internal monorepo.
- README, privacy and security documents match current behavior.
- Windows, Apple Silicon and Intel artifact names match the download-page patterns.
- No certificate, `.p12`, Apple password, notarization key or Windows signing key is tracked.

## Release

1. Update both app versions and `CHANGELOG.md`.
2. Commit to `main` and wait for CI.
3. Create and push `vX.Y.Z`.
4. Wait for the Release workflow to build both platforms and publish the assets.
5. Verify checksums and install on clean Windows and macOS machines.

## Signing

Current community artifacts are unsigned.

Production macOS distribution requires Developer ID Application signing, Hardened Runtime,
notarization and stapling. Production Windows distribution requires an appropriate code-signing
certificate. Store signing material only in protected GitHub Actions secrets.

## Manual acceptance

- Fresh machine with no providers signed in.
- Claude Desktop/IDE only, Claude CLI only, and both together.
- Codex IDE/CLI, Antigravity running/stopped, and provider network failures.
- Launch at login on both systems.
- Windows x64, Apple Silicon and Intel macOS.
- Page download buttons resolve to the matching Release assets.
