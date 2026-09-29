# eko blog

- `main.md`: the article (also linked into the Obsidian vault).
- `excali/*.excalidraw`: diagram sources. Open and edit them in Obsidian (Excalidraw plugin) or excalidraw.com.
- `images/*.png`: exported diagrams used by the article. Do not edit these by hand.

## Workflow

1. Edit a drawing in `excali/`, or add a new `NN-name.excalidraw` file.
2. `pnpm blog:diagrams` exports every drawing to `images/NN-name.png` (pass a filter, e.g. `pnpm blog:diagrams 04`).
   A drawing with frames exports one PNG per frame. Uses the system Chromium; set `CHROME_PATH` to use another browser.
3. Embed it in `main.md` as `![alt text](images/NN-name.png)` with an italic caption line right below.

## Publishing to Medium

1. Commit and push, so the images are reachable on GitHub.
2. `pnpm blog:medium` writes `dist/medium.html`.
3. Open it in a browser, select all, copy, and paste into a new Medium story. Medium keeps headings,
   images with captions, code blocks and links, and re-hosts the images. Set the cover image to the first figure.
