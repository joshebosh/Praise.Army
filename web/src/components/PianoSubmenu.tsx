import React, { useState } from 'react';

interface Key {
  note: number;
  type: 'white' | 'black';
  label: string;
}

interface PianoSubmenuProps {
  onClose: () => void;
  onKeyPress: (note: number) => void;
}

const PianoSubmenu: React.FC<PianoSubmenuProps> = ({ onClose, onKeyPress }) => {
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  // MIDI notes 36-47 (all functional now)
  const keys: Key[] = [
    { note: 36, type: 'white', label: '0' }, // Labeled as 0, sends 0x00
    { note: 37, type: 'black', label: 'C#' },
    { note: 38, type: 'white', label: 'D' },
    { note: 39, type: 'black', label: 'D#' },
    { note: 40, type: 'white', label: 'E' },
    { note: 41, type: 'white', label: 'F' },
    { note: 42, type: 'black', label: 'F#' },
    { note: 43, type: 'white', label: 'G' },
    { note: 44, type: 'black', label: 'G#' },
    { note: 45, type: 'white', label: 'A' },
    { note: 46, type: 'black', label: 'A#' },
    { note: 47, type: 'white', label: 'B' },
  ];

  const handleKeyClick = (note: number): void => {
    if (note < 36 || note > 47) return; // 36-47 are all functional
    
    // Visual feedback
    setActiveKeys(prev => new Set(prev).add(note));
    setTimeout(() => {
      setActiveKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(note);
        return newSet;
      });
    }, 200);

    // Send MIDI command via parent
    onKeyPress(note);
  };

  const whiteKeys = keys.filter(k => k.type === 'white');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-slate-800 to-slate-900 p-12 rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white text-3xl font-bold mb-8 text-center">Yamaha Split Point Selection</h2>
        <div className="relative mb-8">
          {/* White keys */}
          <div className="flex">
            {whiteKeys.map((key) => (
              <button
                key={key.note}
                onClick={() => handleKeyClick(key.note)}
                className={`relative w-24 h-96 border-2 border-gray-800 rounded-b-lg transition-all cursor-pointer ${
                  activeKeys.has(key.note)
                    ? 'bg-blue-200'
                    : 'bg-white hover:bg-gray-100'
                }`}
                title={`Note ${key.note} - ${key.label}`}
              >
                {key.label && (
                  <span className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-lg font-semibold text-gray-700">
                    {key.label === '0' ? '0' : key.note}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Black keys */}
          <div className="absolute top-0 left-0 flex pointer-events-none">
            {keys.map((key, index) => {
              if (key.type === 'black') {
                // Calculate position based on white key pattern
                const whiteKeyIndex = keys.slice(0, index).filter(k => k.type === 'white').length;
                const leftPosition = whiteKeyIndex * 96 - 30; // 96px = white key width, offset by 30px

                return (
                  <button
                    key={key.note}
                    onClick={() => handleKeyClick(key.note)}
                    className={`absolute w-15 h-60 rounded-b-lg border-2 border-gray-900 transition-all pointer-events-auto cursor-pointer ${
                      activeKeys.has(key.note)
                        ? 'bg-blue-500'
                        : 'bg-gray-900 hover:bg-gray-700'
                    }`}
                    style={{ left: `${leftPosition}px`, width: '60px' }}
                    title={`Note ${key.note} - ${key.label}`}
                  >
                    <span className="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-sm font-semibold text-white">
                      {key.note}
                    </span>
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded text-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PianoSubmenu;
