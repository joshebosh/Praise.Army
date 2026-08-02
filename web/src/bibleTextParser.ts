// Parse bible.txt and provide verse lookup.
// Format: "Genesis 1:1 In the beginning God created..."
// Ported verbatim from joshua.tel/praise-army/frontend/src/utils/bibleTextParser.ts

let bibleVerses: Map<string, string> | null = null;

export async function loadBibleText(): Promise<void> {
  if (bibleVerses) return;

  try {
    const response = await fetch("/data/bible.txt");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    bibleVerses = new Map();
    const lines = text.split(/\r?\n/);

    const versePattern = /^(([1-3]\s)?(Song of\s)?\w*)\s+(\d{1,3}):(\d{1,3})\s+(.*)$/;
    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(versePattern);
      if (match) {
        const [, book, , , chapter, verse, verseText] = match;
        const key = `${book.trim()}|${chapter}|${verse}`;
        bibleVerses.set(key, verseText.trim());
      }
    }
  } catch (error) {
    console.error("[BibleText] Failed to load bible.txt:", error);
    bibleVerses = new Map();
  }
}

export function getVerseText(book: string, chapter: number, verse: number): string | null {
  if (!bibleVerses) return null;
  return bibleVerses.get(`${book}|${chapter}|${verse}`) || null;
}
