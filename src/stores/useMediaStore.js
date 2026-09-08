import {create} from 'zustand';
import RNFS from 'react-native-fs';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';

export const useMediaStore = create((set, get) => ({
  driveLinksList: [],
  items: [],
  deviceFiles: [],
  validDeviceFiles: [],
  validDeviceIds: {},
  deviceFilesChecked: false,
  nonFolderFiles: [],
  nonFolderFilesInside: [],
  videos: [],
  data: [],
  folderStack: [],
  iskconFiles: [],
  iskconError: null,
  iskconFolderEntries: [],

  setDriveLinksList: async val => {
    const list =
      typeof val === 'function' ? val(get().driveLinksList) : val;
    set({driveLinksList: list});

    const nonFolderFiles = list.filter(
      item =>
        item.file_path &&
        item.mimeType !== 'application/vnd.google-apps.folder' &&
        isAudioOrVideo(item.mimeType),
    );
    set({nonFolderFiles});
  },

  setItems: val =>
    set(s => ({items: typeof val === 'function' ? val(s.items) : val})),

  setVideos: val =>
    set(s => ({videos: typeof val === 'function' ? val(s.videos) : val})),

  setFolderStack: val =>
    set(s => ({
      folderStack: typeof val === 'function' ? val(s.folderStack) : val,
    })),

  setIskconFiles: val =>
    set(s => ({
      iskconFiles: typeof val === 'function' ? val(s.iskconFiles) : val,
    })),

  setIskconError: val => set({iskconError: val}),

  setIskconFolderEntries: val =>
    set(s => ({
      iskconFolderEntries:
        typeof val === 'function' ? val(s.iskconFolderEntries) : val,
    })),

  // One file can be rendered out of either list — the tab's or the open
  // folder's — and often out of both at once (the root listing behind a folder
  // viewer showing the same file). A download finishing, or its local copy
  // being removed, has to show up wherever that row is, so both are patched
  // rather than each caller guessing which list it is in.
  patchIskconFile: (sourceId, patch) =>
    set(s => {
      const apply = list =>
        list.map(f => (f.source_id === sourceId ? {...f, ...patch} : f));
      return {
        iskconFiles: apply(s.iskconFiles),
        iskconFolderEntries: apply(s.iskconFolderEntries),
      };
    }),

  setDeviceFiles: async val => {
    const files =
      typeof val === 'function' ? val(get().deviceFiles) : val;
    set({deviceFiles: files});

    // Checked in parallel rather than one await at a time: this used to be a
    // sequential round trip per file, and the whole list waited on it.
    const results = await Promise.all(
      files.map(async file =>
        file.file_path && (await RNFS.exists(file.file_path)) ? file : null,
      ),
    );

    // A concurrent call can finish after a later one; applying its answer
    // would describe a list that is no longer on screen. Same guard setData
    // already uses.
    if (get().deviceFiles !== files) return;

    const valid = results.filter(Boolean);

    // An id set beside the list, so a row can ask "am I still on disk?" in
    // one lookup. Scanning validDeviceFiles instead meant every row walked
    // the whole list, on every store change — quadratic in the number of
    // device files, and re-run for unrelated updates like a drive refresh.
    const validDeviceIds = {};
    for (const file of valid) {
      validDeviceIds[file.source_id] = true;
    }

    // Until this runs at least once there is no answer yet, only an empty
    // list — and treating that as "missing" flashed a warning chip on every
    // row for as long as the checks took.
    set({validDeviceFiles: valid, validDeviceIds, deviceFilesChecked: true});
  },

  setData: async val => {
    const data = typeof val === 'function' ? val(get().data) : val;
    set({data});

    if (!data?.length) {
      set({nonFolderFilesInside: []});
      return;
    }

    // Capture reference to detect stale async calls
    const snapshot = data;

    const results = await Promise.all(
      snapshot.map(async item => {
        if (
          item.file_path &&
          item.mimeType !== 'application/vnd.google-apps.folder' &&
          isAudioOrVideo(item.mimeType)
        ) {
          return (await RNFS.exists(item.file_path)) ? item : null;
        }
        return null;
      }),
    );

    // Only apply if data hasn't changed since we started
    if (get().data === snapshot) {
      set({nonFolderFilesInside: results.filter(Boolean)});
    }
  },

  // Was filtering on f.ytube_id/f.driveId, fields no item actually has (the
  // rest of the codebase — bulkActions.js, DriveMenuItems, YTMenuItems — all
  // key on source_id). Those predicates were always true, so nothing was
  // ever actually removed from these lists: the DB delete succeeded, but the
  // item stayed visible in whatever list called this (e.g. CommonMenuItems'
  // "Remove" from a category view).
  removeItem: (type, id) => {
    switch (type) {
      case 'youtube':
        set(s => ({items: s.items.filter(f => f.source_id !== id)}));
        break;
      case 'device':
        set(s => ({deviceFiles: s.deviceFiles.filter(f => f.source_id !== id)}));
        break;
      case 'drive':
        set(s => ({
          driveLinksList: s.driveLinksList.filter(f => f.source_id !== id),
        }));
        break;
      // Only ever reached from a category listing: an iskcon file removed from
      // a category leaves that list, but it is still on the site, so nothing
      // touches the folder listing.
      case 'iskcon':
        set(s => ({
          iskconFiles: s.iskconFiles.filter(f => f.source_id !== id),
        }));
        break;
    }
  },
}));