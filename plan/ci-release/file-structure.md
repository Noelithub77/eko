# CI Release File Structure

```text
eko/
  .github/
    workflows/
      release.yml
  frontend/
    desktop/
      features/
        updates/
          update-check.ts
          UpdatePrompt.tsx
  scripts/
    merge-updater-json.mjs
    sync-version.mjs
  rust/
    tauri.conf.json
    Cargo.toml
    src/
      lib.rs
```
