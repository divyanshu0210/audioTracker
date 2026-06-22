// useIskconPinsStore.js
//
// Pinned Iskcon folders, persisted to AsyncStorage (no SQLite row needed —
// just a small list of {encodedPath, path, title}), scoped per logged-in
// user (same 'userId' AsyncStorage key auth/backup code already relies on)
// so switching accounts on the same device doesn't mix pin lists.
// IskconAudioView (the outermost Iskcon screen) reads pinnedFolders to show
// them up top; IskconItem renders the pin toggle on every folder row, root
// or nested, so any folder can be pinned regardless of depth.

import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PINS_KEY_PREFIX = 'iskcon_pinned_folders_';

const getPinsKey = async () => {
  const userId = await AsyncStorage.getItem('userId');
  return PINS_KEY_PREFIX + (userId || 'guest');
};

const useIskconPinsStore = create((set, get) => ({
  pinnedFolders: [],

  loadPins: async () => {
    try {
      const key = await getPinsKey();
      const raw = await AsyncStorage.getItem(key);
      set({pinnedFolders: raw ? JSON.parse(raw) : []});
    } catch (e) {
      console.log('Failed to load pinned Iskcon folders:', e);
    }
  },

  togglePin: async folder => {
    const {encodedPath, path, title} = folder;
    const current = get().pinnedFolders;
    const updated = current.some(f => f.encodedPath === encodedPath)
      ? current.filter(f => f.encodedPath !== encodedPath)
      : [...current, {encodedPath, path, title}];
    set({pinnedFolders: updated});
    try {
      const key = await getPinsKey();
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.log('Failed to save pinned Iskcon folders:', e);
    }
  },
}));

export default useIskconPinsStore;
