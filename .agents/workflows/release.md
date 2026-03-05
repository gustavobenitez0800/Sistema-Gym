---
description: How to release a new version with auto-update for AyD Funcional Gym
---

# Release Workflow for AyD Funcional Gym

This workflow bumps the version, commits all changes, creates a git tag, pushes to GitHub, and builds the installer with electron-builder which publishes to GitHub Releases for auto-update.

## Steps

1. Bump the version in `package.json` (increment the patch number, e.g., `1.0.33` → `1.0.34`)

// turbo
2. Stage all changes:
```bash
git add -A
```

3. Commit with a descriptive message:
```bash
git commit -m "v<NEW_VERSION>: <brief description of changes>"
```

// turbo
4. Create a git tag matching the new version:
```bash
git tag v<NEW_VERSION>
```

// turbo
5. Push the commit and tag to GitHub:
```bash
git push origin main --tags
```

6. Build the installer and publish to GitHub Releases:
```bash
npm run build
```

This will create `dist/AyD-Funcional-Gym-Setup-<VERSION>.exe` and upload it to GitHub Releases. The auto-updater in the app will detect the new release and prompt users to update.

## Notes
- The `GH_TOKEN` environment variable must be set for publishing to work.
- If the build fails with file locking issues, try closing Explorer windows pointing to `dist/` and retry.
- The `electron-updater` in `main.js` is configured with `autoDownload: true` and `verifyUpdateCodeSignature: false`.
