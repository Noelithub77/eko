# Final relevant structure

```text
eko/
├── docs/
│   └── linux-operator.md
├── plan/linux-audio-operator/
│   ├── file-structure.md
│   └── summary.md
├── scripts/
│   └── eko-operator.mjs
├── rust/src/
│   ├── lib.rs
│   ├── webrtc_core/media_hub.rs
│   └── web_client/mod.rs
└── package.json
```

The CLI remains a Node script using built-in APIs, so no new dependency or
separate daemon is needed. The runtime endpoint is served by the existing local
signaling server and accepts only loopback requests.
