import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { getVerseText, loadBibleText } from "./bibleTextParser";
import {
  type BibleMemIndex,
  type BookEntry,
  type VerseEntry,
  fetchDriveAudioBlobUrl,
  loadBibleMemIndex,
  sortedBooks,
  sortedChapters,
  sortedVerses,
} from "./bibleMemIndex";

interface QueueItem {
  chapter: string;
  verse: string;
  entry: VerseEntry;
}

// Mirrors the original app's three playback scopes, inferred from how much
// is selected: book+chapter+verse(-through) plays a range within one
// chapter; book+chapter alone plays every verse in that chapter; book alone
// plays the whole book in chapter/verse order. Built entirely from what the
// index actually has audio for (no separate canonical book/chapter/verse
// tables to fall out of sync with).
function buildPlaybackQueue(book: BookEntry, chapter: string, verse: string, through: string): QueueItem[] {
  const chaptersToPlay = chapter ? [chapter] : sortedChapters(book);
  const queue: QueueItem[] = [];

  for (const ch of chaptersToPlay) {
    let verses = sortedVerses(book, ch);
    if (chapter && verse) {
      const start = parseInt(verse, 10);
      const end = through ? parseInt(through, 10) : start;
      verses = verses.filter((v) => Number(v) >= start && Number(v) <= end);
    }
    for (const v of verses) {
      queue.push({ chapter: ch, verse: v, entry: book.chapters[ch][v] });
    }
  }
  return queue;
}
import {
  type BibleMemPreset,
  deletePreset,
  loadFontSize,
  savePreset,
  saveFontSize,
  subscribeToPresets,
} from "./presetStore";

const DEFAULT_FONT_SIZE = 18;

function SignInGate({ children }: { children: (user: User) => React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(firebaseAuth, (u) => {
    setUser(u);
    setLoading(false);
  }), []);

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  if (loading) return <div className="center-page">Loading...</div>;

  if (!user) {
    return (
      <div className="center-page">
        <div className="card sign-in-card">
          <h1>Praise Army — Emergency Access</h1>
          <p>Bible Memorization tool. Sign in to continue.</p>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" onClick={handleSignIn}>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return <>{children(user)}</>;
}

function BibleMem({ user }: { user: User }) {
  const [index, setIndex] = useState<BibleMemIndex | null>(null);
  const [bibleTextLoaded, setBibleTextLoaded] = useState(false);

  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [selectedVerse, setSelectedVerse] = useState("");
  const [throughVerse, setThroughVerse] = useState("");
  const [playLoops, setPlayLoops] = useState("1");
  const [verseFontSize, setVerseFontSize] = useState(DEFAULT_FONT_SIZE);

  const [verseTexts, setVerseTexts] = useState<{ verse: number; text: string }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [currentPlayingChapter, setCurrentPlayingChapter] = useState<string | null>(null);
  const [currentPlayingVerse, setCurrentPlayingVerse] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [presets, setPresets] = useState<Record<string, BibleMemPreset>>({});
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const stopRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Keyed by "chapter:verse". Caches the in-flight/resolved fetch itself
  // (not just the eventual Audio element) so calling loadAudio twice for the
  // same slot -- once as "current", once earlier as a preloaded "next" --
  // dedupes into a single network fetch instead of firing twice.
  const audioCacheRef = useRef<Map<string, Promise<HTMLAudioElement>>>(new Map());

  useEffect(() => {
    loadBibleMemIndex().then(setIndex);
    loadBibleText().then(() => setBibleTextLoaded(true));
  }, []);

  useEffect(() => {
    loadFontSize(user.uid).then((size) => {
      if (size) setVerseFontSize(size);
    });
    const unsubscribe = subscribeToPresets(user.uid, setPresets);
    return unsubscribe;
  }, [user.uid]);

  const book: BookEntry | undefined = index?.books
    ? sortedBooks(index).find((b) => b.bookName === selectedBook)
    : undefined;

  const chapterOptions = book ? sortedChapters(book) : [];
  const verseOptions = book && selectedChapter ? sortedVerses(book, selectedChapter) : [];

  const displayVerseText = (bookName: string, chapter: string, verse: string, through: string) => {
    const chapterNum = parseInt(chapter, 10);
    const verseNum = parseInt(verse, 10);
    const throughNum = through ? parseInt(through, 10) : verseNum;
    const verses: { verse: number; text: string }[] = [];
    for (let v = verseNum; v <= throughNum; v++) {
      const text = getVerseText(bookName, chapterNum, v);
      if (text) verses.push({ verse: v, text });
    }
    setVerseTexts(verses);
  };

  useEffect(() => {
    if (selectedBook && selectedChapter && selectedVerse) {
      displayVerseText(selectedBook, selectedChapter, selectedVerse, throughVerse);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBook, selectedChapter, selectedVerse, throughVerse]);

  const handleBookChange = (name: string) => {
    setSelectedBook(name);
    setSelectedChapter("");
    setSelectedVerse("");
    setThroughVerse("");
    setSelectedPreset(null);
    setVerseTexts([]);
  };

  const handleChapterChange = (chapter: string) => {
    setSelectedChapter(chapter);
    setSelectedVerse("");
    setThroughVerse("");
    setSelectedPreset(null);
    setVerseTexts([]);
  };

  // Kicks off (or reuses) fetching+decoding a queue slot without blocking the
  // caller -- calling this for the *next* item while the current one is
  // still being awaited/played is how playback stays gapless instead of
  // fetch-then-play-then-fetch for every single verse. Not awaiting the
  // returned promise here is intentional (fire-and-forget preload).
  const loadAudio = (key: string, entry: VerseEntry): Promise<HTMLAudioElement> => {
    let promise = audioCacheRef.current.get(key);
    if (!promise) {
      promise = fetchDriveAudioBlobUrl(entry).then((blobUrl) => {
        const audio = new Audio(blobUrl);
        audio.preload = "auto";
        return audio;
      });
      audioCacheRef.current.set(key, promise);
    }
    return promise;
  };

  // Blob URLs are already-downloaded local data, so this is just a
  // near-instant decode-readiness check, not a network wait.
  const waitUntilReady = (audio: HTMLAudioElement): Promise<boolean> => {
    if (audio.readyState >= 3) return Promise.resolve(true); // HAVE_FUTURE_DATA+
    return new Promise((resolve) => {
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onReady);
        audio.removeEventListener("error", onError);
      };
      const onReady = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      audio.addEventListener("canplaythrough", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
    });
  };

  const clearAudioCache = () => {
    audioCacheRef.current.forEach((promise) => {
      promise.then((audio) => URL.revokeObjectURL(audio.src)).catch(() => {});
    });
    audioCacheRef.current.clear();
  };

  const handlePlay = async () => {
    if (!book) return;
    const queue = buildPlaybackQueue(book, selectedChapter, selectedVerse, throughVerse);
    if (queue.length === 0) {
      setStatus(`No audio available for ${selectedBook}${selectedChapter ? " " + selectedChapter : ""}`);
      return;
    }

    setIsPlaying(true);
    setIsPaused(false);
    stopRef.current = false;
    setStatus(null);
    clearAudioCache();

    const loops = parseInt(playLoops, 10);
    const keyFor = (item: QueueItem) => `${item.chapter}:${item.verse}`;

    loadAudio(keyFor(queue[0]), queue[0].entry);

    for (let i = 0; i < loops; i++) {
      if (stopRef.current) break;
      setCurrentIteration(i + 1);

      for (let qi = 0; qi < queue.length; qi++) {
        if (stopRef.current) break;
        const item = queue[qi];

        const next = queue[qi + 1];
        if (next) loadAudio(keyFor(next), next.entry);

        let audio: HTMLAudioElement;
        try {
          audio = await loadAudio(keyFor(item), item.entry);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[BibleMem] fetch failed for ${selectedBook} ${item.chapter}:${item.verse}`, message);
          setStatus(`Audio fetch failed for ${selectedBook} ${item.chapter}:${item.verse}: ${message}`);
          continue;
        }

        const ready = await waitUntilReady(audio);
        if (!ready) {
          console.error(`[BibleMem] failed to load ${selectedBook} ${item.chapter}:${item.verse}`);
          setStatus(`Audio failed to load for ${selectedBook} ${item.chapter}:${item.verse}`);
          continue;
        }

        currentAudioRef.current = audio;
        setCurrentPlayingChapter(item.chapter);
        setCurrentPlayingVerse(Number(item.verse));

        // Follow along: update the text display to the verse actually
        // playing right now, not just whatever was in the picker when Play
        // was clicked -- matters most for whole-chapter/whole-book playback,
        // where the queue moves well past the initial selection.
        const liveText = getVerseText(selectedBook, Number(item.chapter), Number(item.verse));
        if (liveText) {
          setVerseTexts([{ verse: Number(item.verse), text: liveText }]);
        }

        try {
          audio.currentTime = 0;
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.addEventListener("ended", () => resolve(), { once: true });
            audio.addEventListener(
              "error",
              () => {
                const message = audio.error?.message || "unknown media error";
                console.error(`[BibleMem] audio error for ${selectedBook} ${item.chapter}:${item.verse}`, message);
                setStatus(`Audio error for ${selectedBook} ${item.chapter}:${item.verse}: ${message}`);
                resolve();
              },
              { once: true },
            );
          });
        } catch (err) {
          const name = err instanceof DOMException ? err.name : "Error";
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[BibleMem] play() failed for ${selectedBook} ${item.chapter}:${item.verse}`, name, message);
          setStatus(`Playback failed for ${selectedBook} ${item.chapter}:${item.verse} (${name}: ${message})`);
        }
        currentAudioRef.current = null;
      }
    }

    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIteration(0);
    setCurrentPlayingChapter(null);
    setCurrentPlayingVerse(null);
  };

  const handleStop = () => {
    stopRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    audioCacheRef.current.forEach((promise) => {
      promise.then((audio) => audio.pause()).catch(() => {});
    });
    clearAudioCache();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentPlayingChapter(null);
    setCurrentPlayingVerse(null);
    setCurrentIteration(0);
  };

  const handlePauseResume = () => {
    const audio = currentAudioRef.current;
    if (!audio) return;
    if (isPaused) {
      audio.currentTime = Math.max(0, audio.currentTime - 1);
      audio.play();
      setIsPaused(false);
    } else {
      audio.pause();
      setIsPaused(true);
    }
  };

  const handlePresetSelect = (id: string) => {
    if (!id) {
      setSelectedPreset(null);
      return;
    }
    const preset = presets[id];
    if (preset) {
      setSelectedPreset(id);
      setSelectedBook(preset.book);
      setSelectedChapter(preset.chapter);
      setSelectedVerse(preset.verse);
      setThroughVerse(preset.throughVerse);
      setPlayLoops(preset.loops);
    }
  };

  const handleAddPreset = async () => {
    if (!selectedBook || !selectedChapter || !selectedVerse) return;
    const title = prompt(
      "Preset title:",
      `${selectedBook} ${selectedChapter}:${selectedVerse}${throughVerse ? "-" + throughVerse : ""}`,
    );
    if (!title || !title.trim()) return;
    const id = await savePreset(user.uid, {
      title: title.trim(),
      book: selectedBook,
      chapter: selectedChapter,
      verse: selectedVerse,
      throughVerse: throughVerse || "",
      loops: playLoops,
    });
    setSelectedPreset(id);
  };

  const handleDeletePreset = async () => {
    if (!selectedPreset) return;
    if (!confirm("Delete this preset?")) return;
    await deletePreset(user.uid, selectedPreset);
    setSelectedPreset(null);
  };

  const handleFontChange = (delta: number) => {
    const size = Math.min(48, Math.max(10, verseFontSize + delta));
    setVerseFontSize(size);
    saveFontSize(user.uid, size);
  };

  const presetList = useMemo(
    () =>
      Object.values(presets)
        .filter((p) => p.id !== "fontSettings" && p.title)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [presets],
  );

  if (!index) return <div className="center-page">Loading Bible index...</div>;

  const indexEmpty = Object.keys(index.books).length === 0;

  return (
    <div className="page">
      <div className="card">
        <div className="header-row">
          <h1>Bible Memorization Tool</h1>
          <div className="controls-row" style={{ marginBottom: 0 }}>
            <a href="/" className="btn btn-outline">
              &larr; Songs
            </a>
            <button className="btn btn-outline" onClick={() => signOut(firebaseAuth)}>
              Sign out
            </button>
          </div>
        </div>
        <p className="subtitle">Emergency access — select verses to memorize and play them repeatedly.</p>
      </div>

      {indexEmpty && (
        <div className="card warning">
          Audio index is empty — run the export workflow to populate it from Firestore.
        </div>
      )}

      <div className="card">
        <div className="grid">
          <label>
            Book
            <select value={selectedBook} onChange={(e) => handleBookChange(e.target.value)}>
              <option value="">Select book</option>
              {sortedBooks(index).map((b) => (
                <option key={b.bookName} value={b.bookName}>
                  {b.bookName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chapter
            <select
              value={selectedChapter}
              onChange={(e) => handleChapterChange(e.target.value)}
              disabled={!selectedBook}
            >
              <option value="">Select chapter</option>
              {chapterOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Verse
            <select
              value={selectedVerse}
              onChange={(e) => {
                setSelectedVerse(e.target.value);
                setThroughVerse("");
                setSelectedPreset(null);
              }}
              disabled={!selectedChapter}
            >
              <option value="">Select verse</option>
              {verseOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Through
            <select
              value={throughVerse}
              onChange={(e) => setThroughVerse(e.target.value)}
              disabled={!selectedVerse}
            >
              <option value="">Through verse</option>
              {verseOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid controls-row">
          <label>
            Loops
            <select value={playLoops} onChange={(e) => setPlayLoops(e.target.value)}>
              {[1, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset
            <select value={selectedPreset || ""} onChange={(e) => handlePresetSelect(e.target.value)}>
              <option value="">Select preset</option>
              {presetList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} | {p.book} {p.chapter}:{p.verse}-{p.throughVerse}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-outline" onClick={handleAddPreset}>
            Save
          </button>
          <button className="btn btn-destructive" disabled={!selectedPreset} onClick={handleDeletePreset}>
            Delete
          </button>
        </div>

        <div className="controls-row">
          <button
            className="btn btn-play"
            disabled={!selectedBook}
            onClick={isPlaying ? handlePauseResume : handlePlay}
          >
            {isPlaying ? (isPaused ? "Resume" : "Pause") : "Play"}
          </button>
          <button className="btn btn-stop" disabled={!isPlaying} onClick={handleStop}>
            Stop
          </button>
        </div>
        <p className="muted" style={{ padding: 0, textAlign: "left" }}>
          {selectedChapter && selectedVerse
            ? "Plays the selected verse range."
            : selectedChapter
              ? "No verse selected — plays the whole chapter."
              : selectedBook
                ? "No chapter selected — plays the whole book."
                : ""}
        </p>

        {isPlaying && (
          <div className="status-box">
            Playing: iteration {currentIteration} of {playLoops}
            {currentPlayingChapter && currentPlayingVerse
              ? ` — ${selectedBook} ${currentPlayingChapter}:${currentPlayingVerse}`
              : ""}
          </div>
        )}
        {status && <div className="status-box warning">{status}</div>}
      </div>

      <div className="card">
        <div className="header-row">
          <h2>
            {isPlaying && currentPlayingChapter && currentPlayingVerse
              ? `${selectedBook} ${currentPlayingChapter}:${currentPlayingVerse}`
              : selectedBook && selectedChapter && selectedVerse
                ? `${selectedBook} ${selectedChapter}:${selectedVerse}${throughVerse ? "-" + throughVerse : ""}`
                : "Verse Text"}
          </h2>
          <div className="font-controls">
            <button className="btn btn-outline" onClick={() => handleFontChange(-2)}>
              −
            </button>
            <button className="btn btn-outline" onClick={() => handleFontChange(2)}>
              +
            </button>
          </div>
        </div>
        {!bibleTextLoaded ? (
          <div>Loading verse text...</div>
        ) : verseTexts.length > 0 ? (
          <div>
            {verseTexts.map(({ verse, text }) => (
              <div
                key={verse}
                className={`verse-line ${currentPlayingVerse === verse ? "playing" : ""}`}
                style={{ fontSize: `${verseFontSize}px` }}
              >
                <span className="verse-num">{verse}.</span> {text}
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">Select a verse to display the text here...</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return <SignInGate>{(user) => <BibleMem user={user} />}</SignInGate>;
}
