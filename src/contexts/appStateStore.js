// stores/dbStore.js
import {create} from 'zustand';

const useAppStateStore = create((set, get) => ({
  loading: false,
  folderCache: {},
  setLoading: isLoading => set({loading: isLoading}),
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
