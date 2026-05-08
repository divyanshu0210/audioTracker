// stores/playerTimeStore.js
import { create } from 'zustand';

const usePlayerTimeStore = create((set, get) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  
  // For seeking without re-renders
  getCurrentTime: () => get().currentTime,
  getDuration: () => get().duration,
}));

export default usePlayerTimeStore;