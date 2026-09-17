import {create} from 'zustand';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';
import {mediaExists} from '../utils/mediaFile';
import {
  hashPendingIdentities,
  repairMissingDeviceFiles,
} from '../utils/fileIdentity';

export const useMediaStore = create((set, get) => ({
  driveLinksList: [],
  items: [],
  deviceFiles: [],
  playableDeviceFiles: [],
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

    // No file_path gate: Drive media streams through the loopback proxy, so a
    // file with no local copy is queueable like any other. Leaving the gate in
    // would have made the queue disagree with the list the user is looking at
    // — tapping the third row would start at the third *downloaded* file.
    const nonFolderFiles = list.filter(
      item =>
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
      files.map(async file => ((await mediaExists(file.file_path)) ? file : null)),
    );

    // A concurrent call can finish after a later one; applying its answer
    // would describe a list that is no longer on screen. Same guard setData
    // already uses.
    if (get().deviceFiles !== files) return;

    const valid = results.filter(Boolean);

    // An id set, so a row can ask "am I still on disk?" in one lookup. The
    // list of present files this was built beside is gone: every caller was
    // asking whether one file was in it, which is this, and the one that
    // wanted a list wanted the playable one below instead.
    const validDeviceIds = {};
    for (const file of valid) {
      validDeviceIds[file.source_id] = true;
    }

    // What can be played, which is a wider question than what is on disk. A
    // file whose bytes are gone but whose copy is in Drive still plays — it
    // streams, exactly as a drive_file does — so a queue built from the
    // on-disk list alone skipped past files the player could have played, and
    // made a tap on one of them start a playlist of one.
    //
    // Filtered from `files` rather than assembled from `valid`, so the queue
    // runs in the order the list is showing.
    const playable = files.filter(
      file => validDeviceIds[file.source_id] || file.drive_file_id,
    );

    // Until this runs at least once there is no answer yet, only an empty
    // list — and treating that as "missing" flashed a warning chip on every
    // row for as long as the checks took.
    set({playableDeviceFiles: playable, validDeviceIds, deviceFilesChecked: true});

    // Everything past this point is repair work, and none of it is allowed to
    // hold up the list. The rows are already on screen with an honest answer;
    // this only improves it.
    const missing = files.filter(
      file => file.type === 'device_file' && !validDeviceIds[file.source_id],
    );

    if (missing.length) {
      repairMissingDeviceFiles(missing)
        .then(repaired => {
          if (!repaired.length) return;
          // Re-pointed rows go back through setDeviceFiles rather than being
          // patched into place, so the presence check runs again over the new
          // paths and the chips, the queue and the menus all agree.
          const byId = new Map(repaired.map(r => [r.sourceId, r.filePath]));
          get().setDeviceFiles(prev =>
            prev.map(file =>
              byId.has(file.source_id)
                ? {...file, file_path: byId.get(file.source_id)}
                : file,
            ),
          );
        })
        .catch(error => console.warn('Repair pass failed:', error?.message));
    }

    // A trickle, not a sweep: each of these reads a whole file. Taking the
    // identity now is what makes the repair above possible later, so it runs
    // whenever the list is looked at and stops as soon as everything is known.
    hashPendingIdentities().catch(() => {});
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
          item.mimeType === 'application/vnd.google-apps.folder' ||
          !isAudioOrVideo(item.mimeType)
        ) {
          return null;
        }
        // A Drive file streams whether or not it was ever downloaded. Anything
        // else in this list is only as playable as its bytes on disk.
        if (item.type === 'drive_file') return item;
        return (await mediaExists(item.file_path)) ? item : null;
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