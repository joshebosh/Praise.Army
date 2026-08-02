// Trimmed port of joshua.tel/praise-army/frontend/src/utils/bibleMemPresetStore.ts
// Keeps preset CRUD + font size only (drops backup/restore — not needed for
// the emergency page). Same Firestore path, already user-scoped in the
// existing security rules: BibleMemPresets/{userId}/presets/{presetId}.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export interface BibleMemPreset {
  id: string;
  userId: string;
  title: string;
  book: string;
  chapter: string;
  verse: string;
  throughVerse: string;
  loops: string;
  createdAt: number;
  updatedAt: number;
}

export async function loadPresets(userId: string): Promise<Record<string, BibleMemPreset>> {
  const snapshot = await getDocs(collection(db, "BibleMemPresets", userId, "presets"));
  const presets: Record<string, BibleMemPreset> = {};
  snapshot.docs.forEach((d) => {
    presets[d.id] = d.data() as BibleMemPreset;
  });
  return presets;
}

export function subscribeToPresets(
  userId: string,
  onChange: (presets: Record<string, BibleMemPreset>) => void,
): () => void {
  return onSnapshot(collection(db, "BibleMemPresets", userId, "presets"), (snapshot) => {
    const presets: Record<string, BibleMemPreset> = {};
    snapshot.docs.forEach((d) => {
      presets[d.id] = d.data() as BibleMemPreset;
    });
    onChange(presets);
  });
}

export async function savePreset(
  userId: string,
  preset: Omit<BibleMemPreset, "id" | "userId" | "createdAt" | "updatedAt">,
): Promise<string> {
  const now = Date.now();
  const id = doc(collection(db, "BibleMemPresets", userId, "presets")).id;
  const newPreset: BibleMemPreset = { ...preset, id, userId, createdAt: now, updatedAt: now };
  await setDoc(doc(db, "BibleMemPresets", userId, "presets", id), newPreset);
  return id;
}

export async function updatePreset(
  userId: string,
  id: string,
  updates: Partial<BibleMemPreset>,
): Promise<void> {
  const ref = doc(db, "BibleMemPresets", userId, "presets", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Preset not found");
  await setDoc(ref, { ...(snap.data() as BibleMemPreset), ...updates, updatedAt: Date.now() });
}

export async function deletePreset(userId: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "BibleMemPresets", userId, "presets", id));
}

export async function loadFontSize(userId: string): Promise<number | null> {
  const snap = await getDoc(doc(db, "BibleMemPresets", userId, "presets", "fontSettings"));
  if (!snap.exists()) return null;
  const size = snap.data()?.verseFontSize;
  return typeof size === "number" ? size : null;
}

export async function saveFontSize(userId: string, size: number): Promise<void> {
  await setDoc(
    doc(db, "BibleMemPresets", userId, "presets", "fontSettings"),
    { verseFontSize: size },
    { merge: true },
  );
}
