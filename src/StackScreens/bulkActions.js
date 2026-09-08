// bulkActions.js
//
// Bulk versions of actions already implemented per-item in the various
// MenuItems files (NoteMenuItems, NBMenuItems, DriveMenuItems, YTMenuItems).
// Same underlying DB/file operations — dispatched per selected item's
// type/subtype and run concurrently via Promise.allSettled, so one failure
// (a missing file, a stale id) doesn't block the rest of the batch. Selected
// items come from useSelectionStore as {id, type, subtype, dbId, file_path,
// title, source_type, source_id} — see BaseItem's selectionEntry.

import RNFS from 'react-native-fs';
import {ItemTypes} from '../contexts/constants';
import {deleteNoteById, deleteNotebook, softDeleteItem} from '../database/D';
import {moveNotesToDefaultNotebook} from '../database/C';
import {moveNoteToNotebook, updateItemFields} from '../database/U';
import {addItemToCategory, removeItemFromCategory} from '../categories/catDB';
import {convertToPdf} from '../notes/utils/convertToPDF';
import {shareNotesAsFile} from '../notes/share/shareNoteFile';
import Share from 'react-native-share';
import {useNotesStore} from '../stores/useNotesStore';
import {useMediaStore} from '../stores/useMediaStore';
import {getLocalFilePath} from '../iskcon/iskconActions';
import {iskconUrlFromSourceId} from '../iskcon/iskconAudioApi';
import {removeSharedCopy} from '../share/shareDeviceFile';
import useDownloadStore from '../stores/useDownloadStore';

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
  // Same reasoning as the single delete in DriveMenuItems: a shared copy is
  // readable by anyone holding the link and must not outlive the file.
  await removeSharedCopy(item.dbId);
  await softDeleteItem(item.subtype, item.id);
};

// Mirrors IskconMenuItems.handleRemove. An iskcon file has no library entry of
// ours to remove — the browse list is the remote site's — so deleting one only
// ever clears the local copy, whatever screen it was invoked from. Both paths
// are unlinked for the same reason handleRemove does it: they're normally the
// same file, but if they ever drift, deleting only file_path leaves the real
// one on disk and the next download reports "already downloaded".
//
// In a listing that is showing one category, it also drops that category link.
// Every other type disappears from such a listing when deleted — softDeleteItem
// stamps the item and getCategoryData filters on deleted_at — so an iskcon row
// staying put reads as the delete having failed, even though un-downloading is
// all it can honestly do. The link is dropped rather than the item, which stays
// available to browse on the site as before.
//
// item.id is the source_id here (that's what BaseItem's selectionEntry puts
// there); item.dbId is the items-table primary key.
const deleteIskconItem = async (item, categoryId = null) => {
  const paths = new Set(
    [
      item.file_path,
      item.title ? getLocalFilePath(item.id, item.title) : null,
    ].filter(Boolean),
  );
  for (const path of paths) {
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  }
  if (item.dbId != null) {
    // The remote url goes back into file_path rather than null. An iskcon
    // file streams from file_path when there's no local copy — that's what
    // ensureDbItem parks there — so nulling it left a row that had once been
    // downloaded unplayable, with nothing to stream from. The browse listing
    // hid this, because playFile falls back to the url on the freshly scraped
    // entry; a row read back out of the db (a category listing) has no such
    // fallback.
    await updateItemFields(item.dbId, {
      file_path: iskconUrlFromSourceId(item.id),
    });
  }
  if (categoryId == null) return {removedFromList: false};
  await removeItemFromCategory(categoryId, item.id, 'iskcon_file');
  return {removedFromList: true};
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
// Returns the notebook row its notes were handed off to when they're kept, so
// the caller can repoint them in the store — otherwise All Notes keeps showing
// the deleted notebook's name and colour on them. null when the notes went too.
const deleteNotebookItem = async (item, deleteNotes) => {
  if (item.title === DEFAULT_NOTEBOOK_TITLE) {
    throw new Error("Default Notebook cannot be deleted");
  }
  let notesMovedTo = null;
  if (!deleteNotes) {
    notesMovedTo = await moveNotesToDefaultNotebook(item.id);
  }
  await deleteNotebook(item.id, {deleteNotes});
  return notesMovedTo;
};

// Removes/updates successfully-processed items across every store that might
// be showing them, so the UI reflects the batch without needing a manual
// refresh. Drive items un-downloaded (not removed) inside a folder just get
// file_path cleared rather than filtered out.
const applyStoreUpdates = (
  removed,
  downloadCleared,
  deleteNotebookNotes,
  notesKeptFrom,
  notesMovedTo,
) => {
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
    const {setNotebooks, removeNotesOfNotebook} = useNotesStore.getState();
    setNotebooks(prev =>
      prev.filter(n => !isRemoved(String(n.id), ItemTypes.NOTEBOOK)),
    );
    // When the notes went with the notebook they must also leave All Notes;
    // filtering notebooks alone leaves them visible until the next refetch.
    if (deleteNotebookNotes) {
      removed
        .filter(r => r.type === ItemTypes.NOTEBOOK)
        .forEach(r => removeNotesOfNotebook(r.id));
    }
  }

  // Notes that outlived their notebook now belong to the Default Notebook —
  // one store write for every notebook in the batch, since they all hand off
  // to the same place. If that notebook had to be revived, getOrCreateDefault-
  // Notebook already put it back in the list.
  if (notesKeptFrom.length && notesMovedTo != null) {
    useNotesStore.getState().reassignNotesOfNotebooks(notesKeptFrom, notesMovedTo);
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
    removed.some(r => r.type === ItemTypes.ISKCON) ||
    downloadCleared.some(r => r.type === ItemTypes.ISKCON)
  ) {
    const {setIskconFiles, setIskconFolderEntries} = useMediaStore.getState();
    // Removal only ever applies to the tab's list — that's the one that can be
    // showing a category. The folder listing is the site's, where nothing was
    // removed; it only needs the file_path patch.
    const patch = i =>
      isDownloadCleared(i.source_id, ItemTypes.ISKCON)
        ? // Back to streaming, matching what deleteIskconItem wrote to the row
          // — not null, which would leave the entry with no source at all.
          {...i, file_path: i.url ?? iskconUrlFromSourceId(i.source_id)}
        : i;

    setIskconFiles(prev =>
      prev.filter(i => !isRemoved(i.source_id, ItemTypes.ISKCON)).map(patch),
    );
    setIskconFolderEntries(prev => prev.map(patch));
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
//
// `categoryId` is the category the list being acted on is showing, or null.
// BulkDeleteConfirmModal derives it: selectedCategory, but only on a Home tab
// (ScreenTypes.MAIN) — the same gate CommonMenuItems uses for "Remove" — so a
// category left selected on Home can't reach into a delete made from
// Downloads, search or inside a folder. Only iskcon files use it; see
// deleteIskconItem.
export const bulkDeleteItems = async (
  items,
  {deleteNotebookNotes, screen, categoryId = null},
) => {
  const removed = [];
  const downloadCleared = [];
  const notesKeptFrom = [];
  let notesMovedTo = null;

  const results = await Promise.allSettled(
    items.map(async item => {
      switch (item.type) {
        case ItemTypes.NOTE:
          await deleteNoteItem(item);
          removed.push(item);
          break;
        case ItemTypes.NOTEBOOK: {
          const movedTo = await deleteNotebookItem(item, deleteNotebookNotes);
          removed.push(item);
          if (movedTo != null) {
            notesKeptFrom.push(item.id);
            notesMovedTo = movedTo;
          }
          break;
        }
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
        case ItemTypes.ISKCON: {
          // Never deletes the item — there is no library entry of ours to
          // remove. It clears the download, and in a category listing also
          // drops that one category link, which is what takes the row out of
          // the list. In the browse listing there is no link and nothing is
          // removed; the file just stops being local.
          const {removedFromList} = await deleteIskconItem(item, categoryId);
          if (removedFromList) removed.push(item);
          downloadCleared.push(item);
          break;
        }
        case ItemTypes.YOUTUBE:
          await deleteYoutubeItem(item);
          removed.push(item);
          break;
        default:
          throw new Error(`Bulk delete not supported for type "${item.type}"`);
      }
    }),
  );

  applyStoreUpdates(
    removed,
    downloadCleared,
    deleteNotebookNotes,
    notesKeptFrom,
    notesMovedTo,
  );

  // Anything removed or un-downloaded here may have had a local copy, and the
  // Downloads screen can't see that through the stores above — it queries the
  // db for file_path. One bump for the batch is enough; it only asks the
  // screen to re-read.
  if (removed.length || downloadCleared.length) {
    useDownloadStore.getState().notifyDownloadsChanged();
  }

  const failed = results
    .map((r, i) => (r.status === 'rejected' ? {item: items[i], error: r.reason} : null))
    .filter(Boolean);

  return {succeeded: items.length - failed.length, failed};
};

// addItemToCategory no-ops on an existing live link (ON CONFLICT DO NOTHING)
// — idempotent, safe to fire for every item without pre-checking membership
// (unlike the single-item modal, which checks per-category to show a
// "✓ already added" label).
export const bulkAddToCategory = async (items, categoryId) => {
  const results = await Promise.allSettled(
    items.map(item => addItemToCategory(categoryId, item.id, item.subtype || item.type)),
  );
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? {item: items[i], error: r.reason} : null))
    .filter(Boolean);
  return {succeeded: items.length - failed.length, failed};
};

// Only notes that live in a notebook can be moved to another notebook. A note
// attached to a drive file / youtube video / device file is anchored to that
// item (source_type + source_id point at it), so "moving" it would orphan it
// from the thing it annotates — the per-item menu gates Move the same way
// (NoteMenuItems only renders it for source_type === 'notebook').
export const isMovableNote = item =>
  item.type === ItemTypes.NOTE && item.source_type === 'notebook';

export const getMovableNotes = items => items.filter(isMovableNote);

// Moves every movable note in the selection into `notebookId`. Non-movable
// items are ignored rather than failed — a mixed selection ("Select All" in
// All Notes) is the normal case, not an error; they come back as `skipped`
// for the caller to report. Notes already in the target notebook are dropped
// silently: the write would be a no-op but would still bump updated_at, and
// they're already where the user asked them to be, so calling them "skipped"
// would read as a problem.
export const bulkMoveNotesToNotebook = async (items, notebook) => {
  const notebookNotes = getMovableNotes(items);
  const skipped = items.length - notebookNotes.length;
  const movable = notebookNotes.filter(
    item => String(item.source_id) !== String(notebook.id),
  );

  const results = await Promise.allSettled(
    movable.map(async item => {
      const success = await moveNoteToNotebook(item.id, notebook.id);
      // moveNoteToNotebook resolves false (not rejects) when the row wasn't
      // found — surface it as a failure so it reaches describeFailures.
      if (!success) throw new Error('Note not found');
    }),
  );

  const moved = [];
  const failed = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      moved.push(movable[i].id);
    } else {
      failed.push({item: movable[i], error: result.reason});
    }
  });

  // One store write for the whole batch — see moveNotesInState.
  useNotesStore.getState().moveNotesInState(moved, notebook);

  return {succeeded: moved.length, failed, skipped};
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

// Shares the selection as a single .atnote bundle another audioTracker can
// import. No per-note limit like MAX_PDF_SHARE_COUNT: there is no native
// rendering step here, just reading rows and serialising them, and the result
// is one attachment however many notes go in — the two things that made a
// large PDF batch slow and unwieldy.
export const bulkShareNotesAsFile = async items => shareNotesAsFile(items);
