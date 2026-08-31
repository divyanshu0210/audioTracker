import {create} from 'zustand';

// Per-file download state. Status flow: queued → downloading → done | failed
// progress: 0-100, or null for indeterminate (unknown content-length)
const useDownloadStore = create((set, get) => ({
  downloads: {},

  // Bumped whenever an item gains or loses its local copy. The Downloads
  // screen reads its list straight from the db rather than from a store, so
  // nothing about clearing a file_path would otherwise reach it and a removed
  // download sat there still looking downloaded until the screen was left and
  // re-entered. A counter rather than a list because the screen just needs to
  // know something changed — it re-queries for what.
  downloadsVersion: 0,

  notifyDownloadsChanged: () =>
    set(s => ({downloadsVersion: s.downloadsVersion + 1})),

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
