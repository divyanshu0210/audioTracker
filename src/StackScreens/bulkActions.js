// bulkActions.js
//
// Bulk versions of actions already implemented per-item in the various
// MenuItems files (NoteMenuItems, NBMenuItems, DriveMenuItems, YTMenuItems).
// Same underlying DB/file operations — dispatched per selected item's
// type/subtype and run concurrently via Promise.allSettled, so one failure
// (a missing file, a stale id) doesn't block the rest of the batch. Selected
// items come from useSelectionStore as {id, type, subtype, dbId, file_path,
// title} — see BaseItem's selectionEntry.

import RNFS from 'react-native-fs';
import {ItemTypes} from '../contexts/constants';
import {deleteNoteById, deleteNotebook, softDeleteItem} from '../database/D';
import {moveNotesToDefaultNotebook} from '../database/C';
import {updateItemFields} from '../database/U';
import {addItemToCategory} from '../categories/catDB';
import {convertToPdf} from '../notes/utils/convertToPDF';
import Share from 'react-native-share';
import {useNotesStore} from '../stores/useNotesStore';
import {useMediaStore} from '../stores/useMediaStore';

const DEFAULT_NOTEBOOK_TITLE = 'Default Notebook';

// Turns a bulk result's `failed` array into a readable list for an Alert —
// callers previously only showed a count ("3 failed"), giving no way to tell
// which items or why. Caps the list so a big batch failing doesn't produce an
// unreadably long dialog.
const MAX_FAILURES_SHOWN = 5;
export const describeFailures = failed => {
  const lines = failed
    .slice(0, MAX_FAILURES_SHOWN)
    .map(({item, error}) => `• ${item.title || item.id}: ${error?.message || 'Unknown error'}`);
  if (failed.length > MAX_FAILURES_SHOWN) {
    lines.push(`...and ${failed.length - MAX_FAILURES_SHOWN} more`);
  }
  return lines.join('\n');
};

// Mirrors DriveMenuItems.handleDeleteDriveFile: inside a folder ("in"),
// deleting a file just un-downloads the local copy; at the top level
// ("out"), it also soft-deletes the library item. Folders have no local
// file, so they always just soft-delete.
const deleteDriveItem = async (item, screen) => {
  if (item.subtype === 'drive_folder') {
    await softDeleteItem(item.subtype, item.id);
    return {removedFromList: true, clearedDownload: false};
  }
  let clearedDownload = false;
  if (item.file_path) {
    if (await RNFS.exists(item.file_path)) {
      await RNFS.unlink(item.file_path);
    }
    if (item.dbId != null) {
      await updateItemFields(item.dbId, {file_path: null});
    }
    clearedDownload = true;
  }
  if (screen !== 'in') {
    await softDeleteItem(item.subtype, item.id);
    return {removedFromList: true, clearedDownload};
  }
  return {removedFromList: false, clearedDownload};
};

// Mirrors DriveMenuItems.handleDeleteDeviceFile — always a full delete,
// screen doesn't change device-file semantics the way it does for Drive.
const deleteDeviceItem = async item => {
  if (item.file_path) {
    if (await RNFS.exists(item.file_path)) {
      await RNFS.unlink(item.file_path);
    }
    if (item.dbId != null) {
      await updateItemFields(item.dbId, {file_path: null});
    }
  }
  await softDeleteItem(item.subtype, item.id);
};

// Mirrors YTMenuItems.handleDeleteYTItem.
const deleteYoutubeItem = async item => {
  await softDeleteItem(item.subtype, item.id);
};

// Mirrors NoteMenuItems' delete (NoteMenuItems.jsx calls deleteNoteById
// directly with no extra steps).
const deleteNoteItem = async item => {
  await deleteNoteById(item.id);
};

// Mirrors NBMenuItems.handleDeleteNotebook. The Default Notebook is excluded
// from bulk delete — it's where moveNotesToDefaultNotebook sends notes from
// every other deleted notebook, and it's easy to sweep in unintentionally via
// "Select All", which would wipe out every note with no other notebook far
// more readily than deleting it deliberately from its own menu would.
const deleteNotebookItem = async (item, deleteNotes) => {
  if (item.title === DEFAULT_NOTEBOOK_TITLE) {
    throw new Error("Default Notebook cannot be deleted");
  }
  if (!deleteNotes) {
    await moveNotesToDefaultNotebook(item.id);
  }
  await deleteNotebook(item.id, {deleteNotes});
};

// Removes/updates successfully-processed items across every store that might
// be showing them, so the UI reflects the batch without needing a manual
// refresh. Drive items un-downloaded (not removed) inside a folder just get
// file_path cleared rather than filtered out.
const applyStoreUpdates = (removed, downloadCleared) => {
  const isRemoved = (id, type) =>
    removed.some(r => r.id === id && r.type === type);
  const isDownloadCleared = (id, type) =>
    downloadCleared.some(r => r.id === id && r.type === type);

  if (removed.some(r => r.type === ItemTypes.NOTE)) {
    const {setNotesList, setMainNotesList} = useNotesStore.getState();
    setNotesList(prev => prev.filter(n => !isRemoved(n.rowid, ItemTypes.NOTE)));
    setMainNotesList(prev => prev.filter(n => !isRemoved(n.rowid, ItemTypes.NOTE)));
  }

  if (removed.some(r => r.type === ItemTypes.NOTEBOOK)) {
    const {setNotebooks} = useNotesStore.getState();
    setNotebooks(prev =>
      prev.filter(n => !isRemoved(String(n.id), ItemTypes.NOTEBOOK)),
    );
  }

  if (removed.some(r => r.type === ItemTypes.YOUTUBE)) {
    const {setItems} = useMediaStore.getState();
    setItems(prev => prev.filter(i => !isRemoved(i.source_id, ItemTypes.YOUTUBE)));
  }

  if (
    removed.some(r => r.type === ItemTypes.DEVICE) ||
    downloadCleared.some(r => r.type === ItemTypes.DEVICE)
  ) {
    const {setDeviceFiles} = useMediaStore.getState();
    setDeviceFiles(prev => prev.filter(i => !isRemoved(i.source_id, ItemTypes.DEVICE)));
  }

  if (
    removed.some(r => r.type === ItemTypes.DRIVE) ||
    downloadCleared.some(r => r.type === ItemTypes.DRIVE)
  ) {
    const {setDriveLinksList, setData} = useMediaStore.getState();
    const patch = list =>
      list
        .filter(i => !isRemoved(i.source_id, ItemTypes.DRIVE))
        .map(i =>
          isDownloadCleared(i.source_id, ItemTypes.DRIVE)
            ? {...i, file_path: null}
            : i,
        );
    setDriveLinksList(patch);
    setData(patch);
  }
};

// Runs the whole batch concurrently. `deleteNotebookNotes` applies to every
// notebook in the selection (the Default Notebook always deletes its notes
// regardless — see deleteNotebookItem). Returns {succeeded, failed} where
// failed entries carry the original item + error for the caller to report.
export const bulkDeleteItems = async (items, {deleteNotebookNotes, screen}) => {
  const removed = [];
  const downloadCleared = [];

  const results = await Promise.allSettled(
    items.map(async item => {
      switch (item.type) {
        case ItemTypes.NOTE:
          await deleteNoteItem(item);
          removed.push(item);
          break;
        case ItemTypes.NOTEBOOK:
          await deleteNotebookItem(item, deleteNotebookNotes);
          removed.push(item);
          break;
        case ItemTypes.DRIVE: {
          const {removedFromList, clearedDownload} = await deleteDriveItem(item, screen);
          if (removedFromList) removed.push(item);
          if (clearedDownload) downloadCleared.push(item);
          break;
        }
        case ItemTypes.DEVICE:
          await deleteDeviceItem(item);
          removed.push(item);
          break;
        case ItemTypes.YOUTUBE:
          await deleteYoutubeItem(item);
          removed.push(item);
          break;
        default:
          throw new Error(`Bulk delete not supported for type "${item.type}"`);
      }
    }),
  );

  applyStoreUpdates(removed, downloadCleared);

  const failed = results
    .map((r, i) => (r.status === 'rejected' ? {item: items[i], error: r.reason} : null))
    .filter(Boolean);

  return {succeeded: items.length - failed.length, failed};
};

// addItemToCategory is INSERT OR IGNORE — idempotent, safe to fire for every
// item without pre-checking membership (unlike the single-item modal, which
// checks per-category to show a "✓ already added" label).
export const bulkAddToCategory = async (items, categoryId) => {
  const results = await Promise.allSettled(
    items.map(item => addItemToCategory(categoryId, item.id, item.subtype || item.type)),
  );
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? {item: items[i], error: r.reason} : null))
    .filter(Boolean);
  return {succeeded: items.length - failed.length, failed};
};

const PDF_CONVERT_TIMEOUT_MS = 20000;

// convertToPdf calls a native module (RNHTMLtoPDF.convert) that could in
// principle hang on a malformed note (a corrupt embedded image, bad HTML)
// instead of rejecting. Without a bound, Promise.allSettled would then wait
// on that one item forever — the whole share action, and the button that
// triggered it, would look permanently stuck rather than just failing that
// one note.
const convertToPdfWithTimeout = noteId =>
  Promise.race([
    convertToPdf(noteId),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF generation timed out')), PDF_CONVERT_TIMEOUT_MS),
    ),
  ]);

// Generation is sequential (see below), so sharing a large selection means a
// multi-second-per-note wait with no way to cancel — and a very large
// Share.open({urls: [...]}) call can also choke whatever app the user shares
// to. Callers should check this before starting and warn instead of grinding
// through an enormous batch.
export const MAX_PDF_SHARE_COUNT = 12;

// Generates each note's PDF one at a time — react-native-html-to-pdf's
// native conversion (its Android implementation renders through a single
// shared WebView) isn't safe to run concurrently; parallel calls collide and
// only the one that wins the shared resource actually completes, which is
// why every note past the first was failing. Once all are ready, makes
// exactly one Share.open call with all of them — Share.open is a single
// native share-sheet UI, it can't be opened multiple times at once, so
// per-file sequential share prompts would be the wrong shape there.
export const bulkShareNotesAsPdf = async items => {
  const filePaths = [];
  const failed = [];

  for (const item of items) {
    try {
      const filePath = await convertToPdfWithTimeout(item.id);
      if (filePath) {
        filePaths.push(`file://${filePath}`);
      } else {
        failed.push({item, error: new Error('convertToPdf returned no file path')});
      }
    } catch (error) {
      failed.push({item, error});
    }
  }

  if (!filePaths.length) {
    return {succeeded: 0, failed};
  }

  await Share.open({
    urls: filePaths,
    type: 'application/pdf',
    title: 'Share Notes PDF',
  });

  return {succeeded: filePaths.length, failed};
};
