#!/usr/bin/env node
// Temporary diagnostic: crawl only Genesis chapter 1 and print the raw
// fileId + resourceKey for verse 1, so we can test the exact real values
// directly rather than guessing. Delete after use.
import { GoogleAuth } from "google-auth-library";

const BIBLE_MP3_FOLDER_ID = "0ByK9asbulrf_dVVTV25UUTlPeW8";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const credentials = JSON.parse(raw);
const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });

async function driveList(params) {
  const client = await auth.getClient();
  const query = new URLSearchParams({ ...params, pageSize: "1000" });
  const res = await client.request({ url: `${DRIVE_API}?${query.toString()}` });
  return res.data.files || [];
}

async function main() {
  const folders = await driveList({
    q: `'${BIBLE_MP3_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and name contains '01_Genesis_001'`,
    fields: "files(id, name)",
  });
  console.log("Genesis ch1 folder candidates:", JSON.stringify(folders));

  for (const folder of folders) {
    const files = await driveList({
      q: `'${folder.id}' in parents and name contains '.mp3'`,
      fields: "files(id, name, resourceKey, webContentLink, webViewLink)",
    });
    console.log(`Folder ${folder.name} (${folder.id}) files:`, JSON.stringify(files.slice(0, 3), null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
