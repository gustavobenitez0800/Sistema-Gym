---
description: How to release a new version with auto-update for AyD Funcional Gym
---

# Release & Auto-Update Workflow

This workflow explains how to publish a new version of the app so existing installations auto-update.

## Prerequisites
- Git configured with remote `origin` pointing to `gustavobenitez0800/Sistema-Gym`
- Node.js 20+ installed
- All changes committed

## Steps

### 1. Bump the version in package.json

Edit `package.json` and increment the `"version"` field. Use semantic versioning:
- **Patch** (bug fixes): `1.0.30` → `1.0.31`
- **Minor** (new features): `1.0.30` → `1.1.0`
- **Major** (breaking changes): `1.0.30` → `2.0.0`

Or use npm to do it automatically:

// turbo
```
npm version patch
```

This auto-increments the version AND creates a git tag.

### 2. If you bumped manually, create & push the git tag

If you edited package.json manually instead of using `npm version`:

```
git add -A
git commit -m "Release vX.Y.Z"
git tag vX.Y.Z
```

### 3. Push commits and tag to GitHub

// turbo
```
git push origin main --follow-tags
```

This pushes both your commits and the `v*` tag, which triggers the GitHub Actions workflow.

### 4. GitHub Actions builds automatically

The workflow at `.github/workflows/build.yml` will:
1. Checkout the tagged commit
2. Install dependencies
3. Build the Electron app with `electron-builder`
4. **Publish** the `.exe`, `.exe.blockmap`, and `latest.yml` directly to a GitHub Release

### 5. Existing installations auto-update

When users open the app:
1. `electron-updater` checks `latest.yml` on the GitHub Release
2. If a newer version exists, it downloads the `.exe` in the background
3. A notification appears: "¡Actualización lista!"
4. On next app restart (or manual click), the update installs automatically

## Troubleshooting

### Auto-update not working?
- Ensure the GitHub Release has **3 files**: `.exe`, `.exe.blockmap`, and `latest.yml`
- Check that `latest.yml` exists and contains the correct version and SHA512 hash
- In the app, press the "Buscar Actualizaciones" button in the sidebar
- Check logs at: `%APPDATA%/ayd-funcional-gym/logs/main.log`

### Build failed on GitHub Actions?
- Check the Actions tab on GitHub for error details
- Common issue: GH_TOKEN permissions — ensure the repo has `contents: write` permission in workflow

### Testing locally
// turbo
```
npm start
```

The app will check for updates on startup. To test with DevTools:
```
npm start -- --dev
```
