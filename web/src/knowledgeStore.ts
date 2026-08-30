// Trimmed port of joshua.tel/praise-army/frontend/src/utils/knowledgeStore.ts.
// The original goes through the main app's FastAPI backend (Firebase Admin
// SDK, bypasses client rules). This talks to Firestore/Storage directly,
// same pattern as presetStore.ts, so the Knowledge Library still works when
// the Vultr/Proxmox backend is down. Requires an authenticated read/write
// rule for /knowledge_items/{itemId} and Storage path knowledge/** -- see
// README.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

export type KnowledgeType = "pdf" | "png" | "link" | "note";

export interface KnowledgeItem {
  id: string;
  title: string;
  type: KnowledgeType;
  url: string;
  description?: string;
  content?: string;
  createdAt: number;
  storagePath?: string;
}

const COLLECTION = "knowledge_items";

function sanitizeTitle(title: string): string {
  return title.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function subscribeToKnowledgeItems(onChange: (items: KnowledgeItem[]) => void): () => void {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<KnowledgeItem, "id">) })));
  });
}

async function uploadFile(file: File): Promise<{ url: string; storagePath: string }> {
  const storagePath = `knowledge/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
}

export async function addKnowledgeItem(
  item: Omit<KnowledgeItem, "id" | "createdAt" | "url" | "storagePath"> & { url?: string },
  file?: File,
): Promise<void> {
  let url = item.url || "";
  let storagePath: string | undefined;

  if (file && item.type !== "link" && item.type !== "note") {
    const uploaded = await uploadFile(file);
    url = uploaded.url;
    storagePath = uploaded.storagePath;
  }

  const sanitized = sanitizeTitle(item.title) || "Untitled";
  const autoId = doc(collection(db, COLLECTION)).id;
  const id = `${sanitized}_${autoId}`;

  const data: Omit<KnowledgeItem, "id"> = {
    title: item.title,
    type: item.type,
    url,
    description: item.description || "",
    content: item.content || "",
    createdAt: Date.now(),
    ...(storagePath ? { storagePath } : {}),
  };

  await setDoc(doc(db, COLLECTION, id), data);
}

export async function updateKnowledgeItem(
  id: string,
  data: Partial<Omit<KnowledgeItem, "id" | "createdAt">>,
  file?: File,
): Promise<void> {
  const updates: Partial<Omit<KnowledgeItem, "id" | "createdAt">> = { ...data };

  if (file && data.type && data.type !== "link" && data.type !== "note") {
    if (data.storagePath) {
      await deleteObject(ref(storage, data.storagePath)).catch((e) => console.warn("Failed to delete old file", e));
    }
    const uploaded = await uploadFile(file);
    updates.url = uploaded.url;
    updates.storagePath = uploaded.storagePath;
  }

  await updateDoc(doc(db, COLLECTION, id), updates);
}

export async function deleteKnowledgeItem(id: string, storagePath?: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
  if (storagePath) {
    await deleteObject(ref(storage, storagePath)).catch((e) => console.warn("Failed to delete file from storage", e));
  }
}

export async function addMultipleLinks(links: { title: string; url: string }[]): Promise<void> {
  const valid = links.filter((l) => l.title.trim() && l.url.trim());
  await Promise.all(
    valid.map((l) => addKnowledgeItem({ title: l.title, type: "link", url: l.url, description: "", content: "" })),
  );
}

export async function uploadMultipleFiles(files: FileList): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  await Promise.all(
    Array.from(files).map(async (file) => {
      try {
        const type: KnowledgeType = file.type === "application/pdf" ? "pdf" : "png";
        const title = file.name.replace(/\.[^/.]+$/, "");
        await addKnowledgeItem({ title, type, description: "", content: "" }, file);
        success++;
      } catch (e) {
        console.error(`Failed to upload ${file.name}`, e);
        failed++;
      }
    }),
  );
  return { success, failed };
}
