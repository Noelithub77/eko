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
    sync-version.mjs
  rust/
    tauri.conf.json
    Cargo.toml
    src/
      lib.rs
```
