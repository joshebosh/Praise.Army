# Praise.Army — Emergency Access Page

Static site serving two things at the same domain:

- **`/`** — the original songs page, untouched.
- **`/biblemem/`** — a static port of the BibleMem Bible Memorization tool from
  joshua.tel/praise-army, meant to keep working even if the main Vultr/Proxmox servers are down.

No backend, no live proxy, no server-held secrets at request time:

- **Verse text** — bundled `web/public/data/bible.txt`, parsed client-side.
- **Sign-in / presets / font size** — direct Firebase client SDK calls (Auth + Firestore),
  same project (`praisearmy-firebase`) and same security rules as the main app.
- **Audio** — streamed directly from Google Drive in the browser, using a static
  `web/public/data/bibleMemIndex.json` index that maps book/chapter/verse to a Drive file ID
  **and resourcekey**. Drive requires a resourcekey for anonymous access to items shared
  before ~2021, even when "Anyone with the link" is on, and it's per-file — not shared with
  the containing folder — so it has to be looked up per verse, not just copied from the
  folder's share link.

## Structure

- `web/` — the Vite + React app; `vite.config.ts` sets `base: "/biblemem/"` so it deploys as a
  subpath alongside the untouched root `index.html`.
- `scripts/export-bible-index.mjs` — crawls the public Bible MP3 Drive folder directly
  (mirrors the original `bible_upload.py` folder traversal: chapter folders → verse files),
  using an authenticated service account to fetch each file's `id` and `resourceKey`. Writes
  `web/public/data/bibleMemIndex.json`. Runs fresh on every deploy — not committed to git.
- `.github/workflows/deploy.yml` — the only workflow. One job: run the export, build `web/`,
  assemble `index.html` (root) + `web/dist` (`/biblemem/`) into one artifact, deploy to Pages.
  Runs on every push to `main`.

## One-time setup

- **Settings → Pages → Build and deployment → Source: "GitHub Actions"** (already done).
- **Repo secret `FIREBASE_SERVICE_ACCOUNT_JSON`** — the same Firebase Admin service-account
  JSON used by the main app's deploy workflows. Needs Drive read access to the Bible MP3
  folder (same account the original backend used) — used only inside the Actions runner,
  never committed or exposed to visitors.
