# Praise.Army — Emergency Access Page

Static, fully self-contained fallback for the [BibleMem](https://praise.army) Bible
Memorization tool, meant to keep working even if the main Vultr/Proxmox servers are down.

No backend, no proxy, no server-held secrets:

- **Verse text** — bundled `web/public/data/bible.txt`, parsed client-side.
- **Sign-in / presets / font size** — direct Firebase client SDK calls (Auth + Firestore),
  same project (`praisearmy-firebase`) and same security rules as the main app.
- **Audio** — streamed directly from Google Drive in the browser (the folder is shared
  "Anyone with the link"), using a static `web/public/data/bibleMemIndex.json` index that
  maps book/chapter/verse to a Drive file ID.

## Structure

- `web/` — the Vite + React app that gets built and deployed to GitHub Pages.
- `scripts/export-bible-index.mjs` — regenerates `web/public/data/bibleMemIndex.json` from
  the live Firestore `BibleMem`/`config` collections (Admin-SDK-only; the client has no read
  rule for that raw data, which is why this export exists at all).
- `.github/workflows/deploy-pages.yml` — builds `web/` and deploys it via GitHub Pages
  (Actions-based deployment).
- `.github/workflows/export-bible-index.yml` — `workflow_dispatch` job that runs the export
  script and commits the updated index. Requires a repo secret `FIREBASE_SERVICE_ACCOUNT_JSON`
  (Firebase Admin key) — used only inside the Actions runner, never committed or exposed to
  visitors.

## One-time setup (manual, not automatable from git)

1. **Settings → Pages → Build and deployment → Source: "GitHub Actions"** (this repo currently
   serves the placeholder `index.html` from the branch root; switching this lets
   `deploy-pages.yml` take over).
2. **Settings → Secrets and variables → Actions → New repository secret** —
   `FIREBASE_SERVICE_ACCOUNT_JSON`, the same Firebase Admin service-account JSON already used
   by the main app's deploy workflows.
3. Run the **"Export Bible Audio Index"** workflow once (Actions tab → Run workflow) to
   populate `bibleMemIndex.json` with real data. Re-run it whenever the audio library changes.
