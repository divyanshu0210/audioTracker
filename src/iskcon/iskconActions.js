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

// A browse row only becomes an item of ours once it is played or downloaded,
// so anything that files one somewhere durable has to create that row first.
// Category links join on items.source_id (see getCategoryData), so a link made
// against a file that was never opened would point at nothing and the category
// would come back empty — which covers Assign too, since AssignScreen files
// its items into a per-mentee category.
//
// The remote url isn't carried on a selection entry, so it's read back out of
// the store. Both listings are searched because a selection can come from
// either screen — the tab (iskconFiles) or an open folder
// (iskconFolderEntries). A source_id in neither already has a DB row (it came
// from a category listing or the downloads list), and needs nothing.
export const ensureIskconRowsExist = async sourceIds => {
  const {iskconFiles, iskconFolderEntries} = useMediaStore.getState();
  const findEntry = sourceId =>
    iskconFiles.find(f => f.source_id === sourceId) ??
    iskconFolderEntries.find(f => f.source_id === sourceId);

  for (const sourceId of sourceIds) {
    const entry = findEntry(sourceId);
    if (!entry || entry.id) continue;
    try {
      await ensureDbItem(entry);
    } catch (e) {
      console.log('Could not create Iskcon item row for', sourceId, e);
    }
  }
};

// Fetch + parse a folder page, enriching each file with its current DB state
// (id / file_path). Publishes nothing: the two screens that browse the site
// keep their listings in different places (see useMediaStore), so the caller
// decides where the result goes.
export const fetchFolderEntries = async (encodedPath = '') => {
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

  return {
    // source_id mirrors what a file row carries, so the list can key and
    // group folder rows the same way — the base list's getItemId knows only
    // rowid/source_id/id, and a folder has none of the others.
    folders: folders.map(f => ({kind: 'folder', source_id: f.encodedPath, ...f})),
    files: enrichedFiles,
  };
};

// Flattened, folders first — the shape the IDT tab's list wants. HomeTabs
// calls this as that tab's "no category selected" loader, in the slot where
// every other tab does a database query.
export const loadIskconRootEntries = async () => {
  const {folders, files} = await fetchFolderEntries('');
  return [...folders, ...files];
};

// The folder viewer's loader: same fetch, published to iskconFolderEntries as
// the one copy of what that screen is showing — the same arrangement
// GoogleDriveViewer has with useMediaStore.data, and for the same reason: a
// row reads its own id / file_path back out of the store, so a finishing
// download or a cleared one repaints without the screen re-fetching. Folders
// are in there too, so the store holds the whole listing rather than half of
// it beside a second local copy.
export const loadIskconFolderEntries = async (encodedPath = '') => {
  const {folders, files} = await fetchFolderEntries(encodedPath);
  const entries = [...folders, ...files];
  useMediaStore.getState().setIskconFolderEntries(entries);
  return entries;
};
