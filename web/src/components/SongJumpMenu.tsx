import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

interface MedleySongState {
  songId: string;
  title: string;
  key: string;
  currentKey: string;
  imageUrl: string | null;
  tesseractData: any;
  isLoading: boolean;
  error?: string | null;
}

interface SongJumpMenuProps {
  onClose: () => void;
  medleySongs: MedleySongState[];
  onJump: (songIndex: number, sectionIndex: number) => void;
}

type MenuView = 'songs' | 'sections';

// Get section color based on MarkerMaker color scheme
const getSectionColor = (sectionName: string): string => {
  const groupColors: { [key: string]: string } = {
    'Intro': '#32CD32',
    'Outro': '#32CD32',
    'Ending': '#32CD32',
    'Breakdown': '#8B4513',
    'Solo': '#8B4513',
    'Bridge': '#1E90FF',
    'Bridge 1': '#1E90FF',
    'Bridge 1a': '#1E90FF',
    'Bridge 1b': '#1E90FF',
    'Bridge 1c': '#1E90FF',
    'Bridge 1d': '#1E90FF',
    'Bridge 1e': '#1E90FF',
    'Bridge 2': '#0000CD',
    'Bridge 2a': '#0000CD',
    'Bridge 2b': '#0000CD',
    'Bridge 3': '#191970',
    'Bridge 3a': '#191970',
    'Bridge 3b': '#191970',
    'Bridge 4': '#0F0F3D',
    'Chorus': '#FF7F50',
    'Chorus 1': '#FF5722',
    'Chorus 1a': '#FF5722',
    'Chorus 1b': '#FF5722',
    'Chorus 1c': '#FF5722',
    'Chorus 2': '#D84315',
    'Chorus 2a': '#D84315',
    'Chorus 2b': '#D84315',
    'Chorus 2c': '#D84315',
    'Chorus 3': '#A52A2A',
    'Chorus 3a': '#A52A2A',
    'Chorus 3b': '#A52A2A',
    'Chorus 4': '#800000',
    'Instrumental': '#FFD700',
    'Instrumental 1': '#FFD700',
    'Instrumental 2': '#FFD700',
    'Instrumental 3': '#FFD700',
    'Instrumental 4': '#FFD700',
    'Interlude': '#20B2AA',
    'Interlude 1': '#20B2AA',
    'Interlude 2': '#20B2AA',
    'Post-Chorus': '#DAA520',
    'Post-Chorus 1': '#DAA520',
    'Post-Chorus 2': '#DAA520',
    'Post-Chorus 3': '#DAA520',
    'Pre-Chorus': '#F5DEB3',
    'Pre-Chorus 1': '#F5DEB3',
    'Pre-Chorus 2': '#F5DEB3',
    'Pre-Chorus 3': '#F5DEB3',
    'Refrain': '#DC143C',
    'Refrain 1': '#DC143C',
    'Refrain 2': '#DC143C',
    'Refrain 3': '#DC143C',
    'Refrain 4': '#DC143C',
    'Tag': '#9370DB',
    'Tag 1': '#9370DB',
    'Tag 1a': '#9370DB',
    'Tag 1b': '#9370DB',
    'Tag 1c': '#9370DB',
    'Tag 2': '#9370DB',
    'Turnaround': '#00CED1',
    'Turnaround 1': '#00CED1',
    'Turnaround 2': '#00CED1',
    'Vamp': '#FF8C00',
    'Vamp 1': '#FF8C00',
    'Vamp 2': '#FF8C00',
    'Verse': '#9932CC',
    'Verse 1': '#8A2BE2',
    'Verse 1a': '#8A2BE2',
    'Verse 1b': '#8A2BE2',
    'Verse 1c': '#8A2BE2',
    'Verse 1d': '#8A2BE2',
    'Verse 1e': '#8A2BE2',
    'Verse 2': '#6A5ACD',
    'Verse 2a': '#6A5ACD',
    'Verse 2b': '#6A5ACD',
    'Verse 2c': '#6A5ACD',
    'Verse 2d': '#6A5ACD',
    'Verse 2e': '#6A5ACD',
    'Verse 3': '#4B0082',
    'Verse 3a': '#4B0082',
    'Verse 3b': '#4B0082',
    'Verse 3c': '#4B0082',
    'Verse 3d': '#4B0082',
    'Verse 3e': '#4B0082',
    'Verse 4': '#663399',
    'Verse 4a': '#663399',
    'Verse 4b': '#663399',
    'Verse 4c': '#663399',
    'Verse 4d': '#663399',
    'Verse 4e': '#663399',
    'Verse 5': '#5D4E75',
    'Verse 5a': '#5D4E75',
    'Verse 5b': '#5D4E75',
    'Verse 5c': '#5D4E75',
    'Verse 5d': '#5D4E75',
    'Verse 5e': '#5D4E75',
    'Verse 6': '#2F1B69',
    'Verse 6a': '#2F1B69',
    'Verse 6b': '#2F1B69',
    'Verse 6c': '#2F1B69',
    'Verse 6d': '#2F1B69',
    'Verse 6e': '#2F1B69',
    'Verse 7': '#1A0E3D',
    'Verse 7a': '#1A0E3D',
    'Verse 7b': '#1A0E3D',
    'Verse 7c': '#1A0E3D',
    'Verse 7d': '#1A0E3D',
    'Verse 7e': '#1A0E3D',
  };
  
  return groupColors[sectionName] || '#16a34a';
};

const SongJumpMenu: React.FC<SongJumpMenuProps> = ({ onClose, medleySongs, onJump }) => {
  const [currentView, setCurrentView] = useState<MenuView>('songs');
  const [selectedSongIndex, setSelectedSongIndex] = useState<number>(0);

  const handleSongSelect = (songIndex: number) => {
    setSelectedSongIndex(songIndex);
    setCurrentView('sections');
  };

  const handleSectionSelect = (sectionIndex: number) => {
    onJump(selectedSongIndex, sectionIndex);
    onClose();
  };

  const handlePrevSong = () => {
    if (selectedSongIndex > 0) {
      setSelectedSongIndex(selectedSongIndex - 1);
    }
  };

  const handleNextSong = () => {
    if (selectedSongIndex < medleySongs.length - 1) {
      setSelectedSongIndex(selectedSongIndex + 1);
    }
  };

  const handleBackToSongs = () => {
    setCurrentView('songs');
  };

  const currentSong = medleySongs[selectedSongIndex];
  const sections = currentSong?.tesseractData?.rectangles || [];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-purple-900 to-purple-800 p-3 sm:p-6 rounded-lg shadow-2xl w-full h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white text-xl sm:text-2xl lg:text-3xl font-bold mb-3 sm:mb-4 text-center">
          {currentView === 'songs' ? 'Select Song' : `${currentSong?.title} (${currentSong?.currentKey})`}
        </h2>

        {currentView === 'songs' ? (
          <div className="flex-1 mb-3 sm:mb-4 overflow-y-auto">
            {medleySongs.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-white text-xl sm:text-2xl font-bold">No songs in broadcaster!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                {medleySongs.map((song, index) => (
                  <button
                    key={index}
                    onClick={() => handleSongSelect(index)}
                    className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-semibold py-4 sm:py-5 lg:py-4 px-3 sm:px-4 rounded-lg transition-colors text-base sm:text-lg lg:text-sm flex items-center justify-center gap-2 min-h-[60px] sm:min-h-[70px] lg:min-h-[60px]"
                  >
                    <span className="opacity-75 text-sm sm:text-base lg:text-sm">({index + 1})</span>
                    <span className="truncate flex-1 font-bold">{song.title}</span>
                    <span className="opacity-75 text-sm sm:text-base lg:text-sm">[{song.currentKey}]</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3 sm:mb-4">
              <button
                onClick={handlePrevSong}
                disabled={selectedSongIndex === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-2 sm:px-4 rounded-lg transition-colors flex items-center justify-center text-sm sm:text-base min-h-[50px] sm:min-h-[60px]"
              >
                <ChevronLeft className="mr-1 sm:mr-2 h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline">Prev Song</span>
                <span className="sm:hidden">Prev</span>
              </button>
              <button
                onClick={handleBackToSongs}
                className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3 sm:py-4 px-2 sm:px-4 rounded-lg transition-colors flex items-center justify-center text-sm sm:text-base min-h-[50px] sm:min-h-[60px]"
              >
                <List className="mr-1 sm:mr-2 h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline">All Songs</span>
                <span className="sm:hidden">All</span>
              </button>
              <button
                onClick={handleNextSong}
                disabled={selectedSongIndex === medleySongs.length - 1}
                className="flex-1 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-2 sm:px-4 rounded-lg transition-colors flex items-center justify-center text-sm sm:text-base min-h-[50px] sm:min-h-[60px]"
              >
                <span className="hidden sm:inline">Next Song</span>
                <span className="sm:hidden">Next</span>
                <ChevronRight className="ml-1 sm:ml-2 h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            <div className="flex-1 mb-3 sm:mb-4 overflow-y-auto">
              {sections.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3">
                  {sections.map((rect: any, index: number) => {
                    const sectionName = rect.label || `Section ${index + 1}`;
                    return (
                      <button
                        key={index}
                        onClick={() => handleSectionSelect(index)}
                        style={{ backgroundColor: getSectionColor(sectionName) }}
                        className="hover:opacity-80 active:opacity-90 text-white font-semibold py-4 sm:py-5 lg:py-4 px-3 sm:px-4 rounded-lg transition-all text-base sm:text-lg lg:text-sm flex items-center justify-center gap-2 min-h-[60px] sm:min-h-[70px] lg:min-h-[60px]"
                      >
                        <span className="opacity-75 text-sm sm:text-base lg:text-sm">({index + 1})</span>
                        <span className="truncate flex-1 font-bold">{sectionName}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-white text-center py-12">
                  <p className="text-base sm:text-xl">No sections available for this song</p>
                </div>
              )}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 sm:py-5 px-4 sm:px-6 rounded-lg transition-colors text-lg sm:text-xl min-h-[60px] sm:min-h-[70px]"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SongJumpMenu;
