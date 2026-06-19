import {create} from 'zustand';

// Per-file download state. Status flow: queued → downloading → done | failed
// progress: 0-100, or null for indeterminate (unknown content-length)
const useDownloadStore = create((set, get) => ({
  downloads: {},

  setDownload: (sourceId, data) =>
    set(s => ({
      downloads: {
        ...s.downloads,
        [sourceId]: {...s.downloads[sourceId], ...data},
      },
    })),

  removeDownload: sourceId =>
    set(s => {
      const {[sourceId]: _, ...rest} = s.downloads;
      return {downloads: rest};
    }),

  getDownload: sourceId => get().downloads[sourceId],
}));

export default useDownloadStore;
