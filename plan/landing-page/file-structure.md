# Website file structure

```text
site/
  index.html          copy, inline hero CSS, download cards
  ops.ts              pnpm ops: check, build, assets, deploy, domain, status
  wrangler.jsonc      Pages project name and output folder
  public/             logo, og.png, fonts, _headers
  src/
    main.ts           download links and lazy loading
    platform.ts       release file names and device detection
    toast.tsx         Sonner toasts (React, loaded on demand)
    enhance.ts        Lenis, ScrollTrigger, scene mounting, controls
    shader.ts         OGL hero ripple field
    sketch.ts         rough.js drawing and draw-on helper
    icons.ts          laptop, phone, person, waves, and other sketches
    style.css         everything below the hero
    scenes/           one module per story scene
```
