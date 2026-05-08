// stores/playerTimeStore.js
import { create } from 'zustand';

const usePlayerTimeStore = create((set, get) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,

  // --- moved out of VLCPlayerComponent ---
  isPaused: false,
  controlsVisible: true,
  skipDirection: null,      // 'forward' | 'backward' | null
  showSkipIndicator: false,

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setControlsVisible: (controlsVisible) => set({ controlsVisible }),
  setSkipDirection: (skipDirection) => set({ skipDirection }),
  setShowSkipIndicator: (showSkipIndicator) => set({ showSkipIndicator }),

  // Read without subscribing (use in callbacks to avoid stale closures)
  getCurrentTime: () => get().currentTime,
  getDuration: () => get().duration,
  getIsPaused: () => get().isPaused,
}));

export default usePlayerTimeStore;