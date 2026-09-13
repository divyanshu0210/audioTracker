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
const FILE_PINS_KEY_PREFIX = 'iskcon_pinned_files_';

const getUserSuffix = async () => {
  const userId = await AsyncStorage.getItem('userId');
  return userId || 'guest';
};

const getPinsKey = async () => PINS_KEY_PREFIX + (await getUserSuffix());
const getFilePinsKey = async () =>
  FILE_PINS_KEY_PREFIX + (await getUserSuffix());

const useIskconPinsStore = create((set, get) => ({
  pinnedFolders: [],
  // Individual files, kept in their own list and keyed by source_id - a file's
  // identity is its path on the site, and unlike a folder it has no
  // encodedPath of its own to key on.
  //
  // A separate storage key rather than a field on the folder entries, so a
  // build that only knows about folder pins reads its list unchanged.
  pinnedFiles: [],

  loadPins: async () => {
    try {
      const [key, fileKey] = await Promise.all([getPinsKey(), getFilePinsKey()]);
      const [raw, fileRaw] = await Promise.all([
        AsyncStorage.getItem(key),
        AsyncStorage.getItem(fileKey),
      ]);
      set({
        pinnedFolders: raw ? JSON.parse(raw) : [],
        pinnedFiles: fileRaw ? JSON.parse(fileRaw) : [],
      });
    } catch (e) {
      console.log('Failed to load pinned Iskcon items:', e);
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

  // Enough of the file to render a row and play it without going back to the
  // site: the listing this is pinned from may not be on screen again.
  togglePinFile: async file => {
    const sourceId = file?.source_id;
    if (!sourceId) return;

    const current = get().pinnedFiles;
    const updated = current.some(f => f.source_id === sourceId)
      ? current.filter(f => f.source_id !== sourceId)
      : [
          ...current,
          {
            source_id: sourceId,
            title: file.title,
            // file_path carries the remote url until a local copy exists, so
            // it is the address either way.
            url: file.url ?? file.file_path ?? null,
          },
        ];

    set({pinnedFiles: updated});
    try {
      const key = await getFilePinsKey();
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.log('Failed to save pinned Iskcon files:', e);
    }
  },
}));

export default useIskconPinsStore;
