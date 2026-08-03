#!/usr/bin/env node
// Crawls the public Bible MP3 Drive folder directly (same traversal as the
// original bible_upload.py: chapter folders -> verse files) and writes a
// static index the emergency page can use with no backend.
//
// Critically, this also captures each file's `resourceKey` -- Google
// requires resource keys for anonymous/public access to older ("legacy ID")
// Drive items shared before ~2021, even when the sharing setting shows
// "Anyone with the link." A resourcekey is NOT interchangeable between the
// folder and the files inside it -- each item has its own, and public
// requests fail (404, or a non-playable response) without the right one for
// that specific file. Our authenticated service account doesn't need
// resource keys itself (auth bypasses that check entirely), so it's used
// here purely to look them up on the anonymous path's behalf.
//
// Credential handling: reads the service-account JSON ONLY from the
// FIREBASE_SERVICE_ACCOUNT_JSON env var (a GitHub Actions secret at
// runtime). Never written to disk, never logged.
import { GoogleAuth } from "google-auth-library";
import { writeFile } from "node:fs/promises";

const BIBLE_MP3_FOLDER_ID = "0ByK9asbulrf_dVVTV25UUTlPeW8";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  process.exit(1);
}
const credentials = JSON.parse(raw);

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

async function driveList(params) {
  const client = await auth.getClient();
  const results = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ ...params, pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const res = await client.request({ url: `${DRIVE_API}?${query.toString()}` });
    results.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return results;
}

function parseFolderName(name) {
  const m = name.match(/^(\d+)_([\w_]+)_(\d+)/i);
  if (!m) return null;
  return {
    bookNum: parseInt(m[1], 10),
    bookName: m[2].replace(/_/g, " "),
    chapterNum: parseInt(m[3], 10),
  };
}

function parseVerseNumber(filename) {
  const m = filename.match(/^(\d+)\.mp3$/i);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  console.log("Listing chapter folders...");
  const chapterFolders = await driveList({
    q: `'${BIBLE_MP3_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder'`,
    fields: "nextPageToken, files(id, name)",
  });
  console.log(`Found ${chapterFolders.length} chapter folders.`);

  const books = {};
  const processedChapters = new Set();
  let totalVerses = 0;

  for (const [i, folder] of chapterFolders.entries()) {
    const parsed = parseFolderName(folder.name);
    if (!parsed) continue;

    const chapterKey = `${parsed.bookNum}_${parsed.bookName}_${parsed.chapterNum}`;
    if (processedChapters.has(chapterKey)) continue;
    processedChapters.add(chapterKey);

    const files = await driveList({
      q: `'${folder.id}' in parents and name contains '.mp3'`,
      fields: "nextPageToken, files(id, name, resourceKey)",
    });

    const bookKey = `${String(parsed.bookNum).padStart(2, "0")}_${parsed.bookName.toUpperCase().replace(/ /g, "_")}`;
    if (!books[bookKey]) {
      books[bookKey] = { bookNum: parsed.bookNum, bookName: parsed.bookName, chapters: {} };
    }
    const chapterMap = (books[bookKey].chapters[parsed.chapterNum] ||= {});

    for (const file of files) {
      const verseNum = parseVerseNumber(file.name);
      if (verseNum === null) continue;
      chapterMap[verseNum] = { fileId: file.id, filename: file.name, resourceKey: file.resourceKey };
      totalVerses++;
    }

    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${chapterFolders.length} chapter folders processed`);
  }

  const index = { generatedAt: new Date().toISOString(), books };
  await writeFile(
    new URL("../web/public/data/bibleMemIndex.json", import.meta.url),
    JSON.stringify(index, null, 2),
  );
  console.log(`Exported ${Object.keys(books).length} books, ${totalVerses} verses.`);

  // TEMPORARY diagnostic -- remove once playback is confirmed working.
  const genesis = Object.values(books).find((b) => b.bookName === "Genesis");
  console.log("DEBUG Genesis 1:1 entry:", JSON.stringify(genesis?.chapters?.[1]?.[1]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
