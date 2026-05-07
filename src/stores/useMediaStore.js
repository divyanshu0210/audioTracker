import {create} from 'zustand';
import RNFS from 'react-native-fs';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';

export const useMediaStore = create((set, get) => ({
  driveLinksList: [],
  items: [],
  deviceFiles: [],
  validDeviceFiles: [],
  nonFolderFiles: [],
  nonFolderFilesInside: [],
  videos: [],
  data: [],
  folderStack: [],

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

  setDeviceFiles: async val => {
    const files =
      typeof val === 'function' ? val(get().deviceFiles) : val;
    set({deviceFiles: files});

    const valid = [];
    for (const file of files) {
      if (file.file_path && (await RNFS.exists(file.file_path))) {
        valid.push(file);
      }
    }
    set({validDeviceFiles: valid});
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

  removeItem: (type, id) => {
    switch (type) {
      case 'youtube':
        set(s => ({items: s.items.filter(f => f.ytube_id !== id)}));
        break;
      case 'device':
        set(s => ({deviceFiles: s.deviceFiles.filter(f => f.driveId !== id)}));
        break;
      case 'drive':
        set(s => ({
          driveLinksList: s.driveLinksList.filter(f => f.driveId !== id),
        }));
        break;
    }
  },
}));