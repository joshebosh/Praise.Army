// Parse bible.txt and provide verse lookup.
// Format: "Genesis 1:1 In the beginning God created..."
// Ported verbatim from joshua.tel/praise-army/frontend/src/utils/bibleTextParser.ts

let bibleVerses: Map<string, string> | null = null;

export async function loadBibleText(): Promise<void> {
  if (bibleVerses) return;

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/bible.txt`);
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

// bibleMemIndex.json names numbered books with Roman numerals ("I John",
// "II Corinthians"); bible.txt (and this parser's key format) uses Arabic
// numerals ("1 John", "2 Corinthians"). Normalize before lookup so those
// books resolve instead of silently missing every verse.
const ROMAN_BOOK_PREFIX: Record<string, string> = { I: "1", II: "2", III: "3" };

function normalizeBookName(book: string): string {
  const [first, ...rest] = book.split(" ");
  const arabicPrefix = ROMAN_BOOK_PREFIX[first];
  return arabicPrefix ? [arabicPrefix, ...rest].join(" ") : book;
}

export function getVerseText(book: string, chapter: number, verse: number): string | null {
  if (!bibleVerses) return null;
  return bibleVerses.get(`${normalizeBookName(book)}|${chapter}|${verse}`) || null;
}
