import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { getVerseText, loadBibleText } from "./bibleTextParser";
import {
  type BibleMemIndex,
  type BookEntry,
  driveAudioUrl,
  loadBibleMemIndex,
  sortedBooks,
  sortedChapters,
  sortedVerses,
} from "./bibleMemIndex";
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
  const [currentIteration, setCurrentIteration] = useState(0);
  const [currentPlayingVerse, setCurrentPlayingVerse] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [presets, setPresets] = useState<Record<string, BibleMemPreset>>({});
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const stopRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const handlePlay = async () => {
    if (!book || !selectedChapter || !selectedVerse) return;
    setIsPlaying(true);
    stopRef.current = false;
    setStatus(null);

    const startVerse = parseInt(selectedVerse, 10);
    const endVerse = throughVerse ? parseInt(throughVerse, 10) : startVerse;
    const loops = parseInt(playLoops, 10);

    for (let i = 0; i < loops; i++) {
      if (stopRef.current) break;
      setCurrentIteration(i + 1);

      for (let v = startVerse; v <= endVerse; v++) {
        if (stopRef.current) break;

        const verseData = book.chapters[selectedChapter]?.[String(v)];
        if (!verseData) {
          setStatus(`No audio for ${selectedBook} ${selectedChapter}:${v}`);
          continue;
        }

        const audio = new Audio(driveAudioUrl(verseData.fileId));
        currentAudioRef.current = audio;
        setCurrentPlayingVerse(v);

        try {
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.addEventListener("ended", () => resolve(), { once: true });
            audio.addEventListener(
              "error",
              () => {
                const code = audio.error?.code;
                const message = audio.error?.message || "unknown media error";
                console.error(`[BibleMem] audio error for ${selectedBook} ${selectedChapter}:${v}`, code, message);
                setStatus(`Audio error for ${selectedBook} ${selectedChapter}:${v}: ${message}`);
                resolve();
              },
              { once: true },
            );
          });
        } catch (err) {
          const name = err instanceof DOMException ? err.name : "Error";
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[BibleMem] play() failed for ${selectedBook} ${selectedChapter}:${v}`, name, message);
          setStatus(`Playback failed for ${selectedBook} ${selectedChapter}:${v} (${name}: ${message})`);
        }
        currentAudioRef.current = null;
      }
    }

    setIsPlaying(false);
    setCurrentIteration(0);
    setCurrentPlayingVerse(null);
  };

  const handleStop = () => {
    stopRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentPlayingVerse(null);
    setCurrentIteration(0);
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
            disabled={!selectedBook || !selectedChapter || !selectedVerse || isPlaying}
            onClick={handlePlay}
          >
            Play
          </button>
          <button className="btn btn-stop" disabled={!isPlaying} onClick={handleStop}>
            Stop
          </button>
        </div>

        {isPlaying && (
          <div className="status-box">
            Playing: iteration {currentIteration} of {playLoops}
          </div>
        )}
        {status && <div className="status-box warning">{status}</div>}
      </div>

      <div className="card">
        <div className="header-row">
          <h2>
            {selectedBook && selectedChapter && selectedVerse
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
