// iskconActions.js
//
// DB-backed actions shared by the Iskcon folder screens. A DB row only gets
// created when a file is played or downloaded — until then a file is just a
// scraped {title, url, path}. Rows use their own 'iskcon_file' type (rather
// than 'device_file') so they never show up in Device-tab queries.

import RNFS from 'react-native-fs';
import {getItemBySourceId, upsertItem} from '../database/C';
import {navigationRef} from '../handlers/navigationRef';
import {useMediaStore} from '../stores/useMediaStore';
import {fetchFolder} from './iskconAudioApi';

export const getLocalFilePath = (sourceId, fileName) => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeId = sourceId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  return `${RNFS.ExternalDirectoryPath}/iskcon_${safeId}_${safeName}.mp3`;
};

// Find an existing DB row for this remote file, or create one (remote URL as
// file_path so it's streamable even before download).
export const ensureDbItem = async file => {
  const existing = await getItemBySourceId(file.source_id, 'iskcon_file');
  if (existing) return existing;
  return upsertItem({
    source_id: file.source_id,
    type: 'iskcon_file',
    title: file.title,
    mimeType: 'audio/mpeg',
    file_path: file.url,
  });
};

// Upsert (if needed), prefer local copy when available, open the VLC player.
export const playFile = async (file, filePath) => {
  try {
    const item = await ensureDbItem(file);
    let resolvedPath = filePath || file.url;
    if (resolvedPath && !resolvedPath.startsWith('http')) {
      resolvedPath = (await RNFS.exists(resolvedPath)) ? resolvedPath : file.url;
    }
    navigationRef.navigate('BacePlayer', {
      item: {...item, type: 'iskcon_file', mimeType: 'audio/mpeg', file_path: resolvedPath},
    });
  } catch {
    navigationRef.navigate('BacePlayer', {
      item: {
        source_id: file.source_id,
        title: file.title,
        type: 'iskcon_file',
        mimeType: 'audio/mpeg',
        file_path: file.url,
      },
    });
  }
};

// Fetch + parse a folder, then enrich each file with its current DB state
// (id / file_path) and publish the result into useMediaStore.iskconEntries —
// the same "list in the store, item reads from the store" pattern Drive/Device
// use, so BaseMenu deleting a file or a download completing is reflected
// automatically wherever that file is rendered.
export const loadFolderEntries = async (encodedPath = '') => {
  const {folders, files} = await fetchFolder(encodedPath);

  const enrichedFiles = await Promise.all(
    files.map(async f => {
      const dbItem = await getItemBySourceId(f.path, 'iskcon_file');
      return {
        kind: 'file',
        source_id: f.path,
        title: f.title,
        url: f.url,
        mimeType: 'audio/mpeg',
        type: 'iskcon_file',
        id: dbItem?.id ?? null,
        file_path: dbItem?.file_path ?? null,
      };
    }),
  );

  useMediaStore.getState().setIskconEntries(enrichedFiles);

  return {
    folders: folders.map(f => ({kind: 'folder', ...f})),
    files: enrichedFiles,
  };
};
