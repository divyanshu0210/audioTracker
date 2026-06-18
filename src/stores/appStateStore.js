// stores/dbStore.js
import {create} from 'zustand';

const useAppStateStore = create((set, get) => ({
  folderCache: {},
  setFolderCache: (folderId, items) =>
    set(state => ({
      folderCache: {
        ...state.folderCache,
        [folderId]: items,
      },
    })),

  getFolderFromCache: folderId => {
    return get().folderCache[folderId];
  },

  clearFolderCache: () => set({folderCache: {}}),
}));

export default useAppStateStore;
