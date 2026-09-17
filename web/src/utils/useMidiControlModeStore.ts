import { create } from 'zustand';

type MidiControlMode = 'midi' | 'api';

interface MidiControlModeState {
  mode: MidiControlMode;
  isLoading: boolean;
  error: string | null;
  setMode: (mode: MidiControlMode) => Promise<void>;
  initializeMode: () => Promise<void>;
}

// Simple in-memory store for MIDI control mode (defaults to 'midi')
// Can be extended to use Firebase or localStorage later
const useMidiControlModeStore = create<MidiControlModeState>((set) => ({
  mode: 'midi',
  isLoading: false,
  error: null,

  initializeMode: async () => {
    // Check localStorage for saved mode
    try {
      const saved = localStorage.getItem('midiControlMode');
      if (saved === 'api' || saved === 'midi') {
        set({ mode: saved, isLoading: false, error: null });
        console.log(`[MidiControlMode] Loaded from localStorage: ${saved}`);
        return;
      }
    } catch (e) {
      console.warn('[MidiControlMode] Could not read localStorage');
    }
    
    // Default to 'midi' mode
    set({ mode: 'midi', isLoading: false, error: null });
    console.log(`[MidiControlMode] Initialized with default: midi`);
  },

  setMode: async (mode: MidiControlMode) => {
    set({ mode });
    try {
      localStorage.setItem('midiControlMode', mode);
      console.log(`[MidiControlMode] Updated mode: ${mode}`);
    } catch (e) {
      console.warn('[MidiControlMode] Could not save to localStorage');
    }
  },
}));

export default useMidiControlModeStore;
