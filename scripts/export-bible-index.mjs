#!/usr/bin/env node
// One-off/periodic export: mirrors the Firestore `BibleMem` + `config/BibleMem`
// collections (Admin-SDK-only — no client read rule exists for them) into a
// static JSON the emergency page can fetch with no backend and no secret.
//
// Credential handling: reads the service-account JSON ONLY from the
// FIREBASE_SERVICE_ACCOUNT_JSON env var (set from a GitHub Actions secret at
// workflow runtime). It is never written to disk and never logged.
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFile } from "node:fs/promises";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  process.exit(1);
}

const serviceAccount = JSON.parse(raw);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const configDoc = await db.collection("config").doc("BibleMem").get();
  const bookKeys = configDoc.exists ? configDoc.data().books || [] : [];

  if (bookKeys.length === 0) {
    console.error("config/BibleMem has no `books` list — nothing to export");
    process.exit(1);
  }

  const books = {};
  for (const bookKey of bookKeys) {
    const doc = await db.collection("BibleMem").doc(bookKey).get();
    if (!doc.exists) continue;
    const data = doc.data();

    const chapters = {};
    for (const [chapterNum, verses] of Object.entries(data.chapters || {})) {
      const verseMap = {};
      for (const [verseNum, verseData] of Object.entries(verses)) {
        if (!verseData?.fileId) continue;
        verseMap[verseNum] = { fileId: verseData.fileId, filename: verseData.filename };
      }
      if (Object.keys(verseMap).length > 0) chapters[chapterNum] = verseMap;
    }

    books[bookKey] = { bookNum: data.bookNum, bookName: data.bookName, chapters };
  }

  const index = { generatedAt: new Date().toISOString(), books };
  await writeFile(
    new URL("../web/public/data/bibleMemIndex.json", import.meta.url),
    JSON.stringify(index, null, 2),
  );

  const totalVerses = Object.values(books).reduce(
    (sum, b) => sum + Object.values(b.chapters).reduce((s, c) => s + Object.keys(c).length, 0),
    0,
  );
  console.log(`Exported ${Object.keys(books).length} books, ${totalVerses} verses.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
