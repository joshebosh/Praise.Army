# Praise.Army — Emergency Access Page

Static site serving three top-level pages at the same domain, all cross-linked via a
"Pages" dropdown:

- **`/`** — the original songs page, untouched.
- **`/biblemem/`** — a static port of the BibleMem Bible Memorization tool from
  joshua.tel/praise-army, meant to keep working even if the main Vultr/Proxmox servers are down.
- **`/knowledge/`** — a static port of `praise-army/frontend/src/pages/Knowledge.tsx`
  (the Knowledge Library). Same purpose: keeps working when the main servers are down.

`/biblemem/` and `/knowledge/` are the *exact same* Vite build (`web/dist`), deployed to two
directories in the CI workflow. `App.tsx` picks which page to render by checking
`window.location.pathname` at load, not by an in-app route — each is a real top-level URL, not
a hash flag under the other.

No backend, no live proxy, no server-held secrets at request time:

- **Verse text** — bundled `web/public/data/bible.txt`, parsed client-side.
- **Sign-in / presets / font size** — direct Firebase client SDK calls (Auth + Firestore),
  same project (`praisearmy-firebase`) and same security rules as the main app.
- **Knowledge Library items** — direct Firestore/Storage client calls
  (`web/src/knowledgeStore.ts`), same pattern as presets. **Requires a Firestore rule that
  doesn't exist yet**: the original `Knowledge.tsx` reads/writes the `knowledge_items`
  collection only through the main app's FastAPI backend, which uses the Firebase Admin SDK and
  so bypasses client security rules entirely. Until an authenticated read/write rule is added
  for `/knowledge_items/{itemId}` (and Storage path `knowledge/**`) in the Firebase console,
  this page will get permission-denied on every read/write. Add, e.g.:
  ```
  match /knowledge_items/{itemId} {
    allow read, write: if request.auth != null;
  }
  ```
  and update `joshua.tel/FIREBASE.md`'s rules section to match.
- **Audio** — fetched directly from the Google Drive API in the browser (`fetch()` + `Blob` +
  `URL.createObjectURL`, not `<audio src>` directly — Drive requires a per-file resourcekey
  header, which `<audio src>` can't send) using a static `web/public/data/bibleMemIndex.json`
  index that maps book/chapter/verse to a Drive file ID **and resourcekey**. Drive requires the
  resourcekey for anonymous access to items shared before ~2021, even when "Anyone with the
  link" is on, and it's per-file — not shared with the containing folder — so it has to be
  looked up per verse. Auth is a public, HTTP-referrer-restricted (`https://praise.army/*`) API
  key, injected at build time from the `GOOGLE_DRIVE_API_KEY` secret via `VITE_DRIVE_API_KEY`
  — never committed to source.

## Structure

- `web/` — the Vite + React app; `vite.config.ts` sets `base: "/biblemem/"` so it deploys as a
  subpath alongside the untouched root `index.html`.
- `scripts/export-bible-index.mjs` — crawls the public Bible MP3 Drive folder directly
  (mirrors the original `bible_upload.py` folder traversal: chapter folders → verse files),
  using an authenticated service account to fetch each file's `id` and `resourceKey`. Writes
  `web/public/data/bibleMemIndex.json`, which is **committed to git** and only regenerated on
  demand (Actions tab → "Run workflow" → check "Refresh Bible audio index") — the crawl takes
  ~4 minutes across 1,189 Drive folders, and the audio library barely changes, so it doesn't
  run on every ordinary push.
- `.github/workflows/deploy.yml` — the only workflow. Builds `web/`, assembles `index.html`
  (root) + `favicon.ico` + `web/dist` (`/biblemem/`) into one artifact, deploys to Pages. Runs
  on every push to `main`; the index refresh step only runs when explicitly requested via
  `workflow_dispatch`.

## One-time setup

- **Settings → Pages → Build and deployment → Source: "GitHub Actions"** (already done).
- **Repo secret `FIREBASE_SERVICE_ACCOUNT_JSON`** — the same Firebase Admin service-account
  JSON used by the main app's deploy workflows. Needs Drive read access to the Bible MP3
  folder (same account the original backend used) — used only inside the Actions runner,
  never committed or exposed to visitors. Only consumed when the index refresh is triggered.
- **Repo secret `GOOGLE_DRIVE_API_KEY`** — a public, browser-facing Drive API key, restricted
  in Google Cloud Console to API = Drive API only, Application = HTTP referrers →
  `https://praise.army/*`. Injected into the build as `VITE_DRIVE_API_KEY`; ends up in the
  shipped JS bundle either way (unavoidable for a browser key) — the referrer restriction is
  what makes that safe, not keeping it out of the bundle.

## Known open issue — real-browser Drive audio fetch failures

Audio playback fails in real-world browser testing (including Incognito, no extensions) with
`TypeError: Failed to fetch` / "blocked by CORS policy" / `403 Forbidden`, while every
server-side reproduction (curl, matching key/referrer/resourcekey, full realistic
`Sec-Fetch-*`/`User-Agent` headers, and the CORS preflight `OPTIONS` request itself) succeeds
consistently. The deployed bundle has been confirmed byte-for-byte to contain the correct,
currently-registered API key. The leading remaining hypothesis is something on the affected
user's actual network path to Google (TLS-inspecting corporate/ISP proxy, antivirus HTTPS
scanning, DNS-level filtering) mangling CORS response headers in a way no request from this
repo's CI/dev environment can reproduce. `fetchDriveAudioBlobUrl` in `web/src/bibleMemIndex.ts`
now runs a no-custom-header, preflight-free reachability probe whenever the main fetch fails,
and folds the result into the error message shown in the UI — the next failure report should
say whether Google is unreachable outright from that browser, or specifically the
resourcekey-header request path.
