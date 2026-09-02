// importNoteFile.js
//
// Reads a .atnote bundle and inserts its notes into the local DB.
//
// A note that arrived with a media descriptor is re-attached to that media:
// the item is created (or found, if this device already has it) and the note
// is anchored to it exactly as a locally-taken note would be, which is what
// makes its timestamps seek something. See noteMedia for what a descriptor
// carries and why it is a reference rather than the file itself.
//
// Everything else — notes taken in a notebook, notes from a v1 bundle, notes
// whose media couldn't be recreated — lands in a dedicated "Shared Notes"
// notebook. A notebook is the one home that always exists, and keeping those
// imports together gives an obvious place to look after opening a file.

import RNFS from 'react-native-fs';
import {getOrCreateNotebookByTitle} from '../../database/C';
import {generateId} from '../useNoteController';
import {
  createNewNote,
  getNoteRowState,
  purgeNoteRow,
  saveImage,
  updateNote,
  updateNoteTitle,
} from '../richDB';
import {useNotesStore} from '../../stores/useNotesStore';
import {
  addItemToCategory,
  getOrCreateSharedNotesCategoryId,
} from '../../categories/catDB';
import {parseNoteBundle, remapImageIds} from './noteFileFormat';
import {ensureMediaItem} from './noteMedia';

export const SHARED_NOTEBOOK_TITLE = 'Shared Notes';
const SHARED_NOTEBOOK_COLOR = '#8B5CF6';

/**
 * The sender's note id, as a rowid this device can insert under.
 *
 * Only a plain positive integer is usable — a rowid has to be one, and a
 * bundle is plain JSON that anything could have written. Anything else (a v1
 * or v2 file, which carries no uid at all) falls back to a fresh local id,
 * which simply means that note imports every time, exactly as before.
 */
const uidToRowId = uid => {
  if (uid == null) return null;
  const n = Number(uid);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Reads a shared file, whether it arrived as a file:// path or a content://
 * URI. RNFS.readFile handles both on Android, but content URIs are the case
 * that actually turns up in practice — anything routed through the share sheet
 * or a downloads provider comes through as content://.
 */
const readSharedFile = async uri => {
  const target = uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
  return RNFS.readFile(target, 'utf8');
};

/**
 * Imports every note in the bundle at `uri`.
 *
 * Each note is inserted with fresh ids — note rowids and image ids both. Image
 * ids can't be reused because the local images table will already have rows
 * under those ids from unrelated notes, so the HTML's data-image-id references
 * are rewritten to match (see remapImageIds). Timestamps need no such
 * rewriting: they are positions in the recording, not ids, and mean the same
 * thing on any device once the note is anchored to the same media.
 *
 * Returns {succeeded, failed, skipped, notebook, mediaItems}. `notebook` is null when
 * every note found its media — the notebook is only created if something
 * actually has to go in it, so importing a lecture's notes doesn't leave an
 * empty "Shared Notes" behind. Individual notes that fail are skipped rather
 * than aborting the import — one malformed note in a bundle of twenty
 * shouldn't cost the other nineteen.
 */
export const importNoteFile = async uri => {
  const text = await readSharedFile(uri);
  const notes = parseNoteBundle(text);

  const imported = [];
  const failed = [];
  // Notes this bundle has already delivered once. Reported, not silent: the
  // user tapped a file expecting something to happen, and "nothing appeared"
  // and "it was already here" look identical otherwise.
  const skipped = [];

  // Both created on demand, once, for the first note that needs them.
  let sharedCategory = null;
  const sharedCategoryId = async () => {
    if (sharedCategory == null) {
      sharedCategory = await getOrCreateSharedNotesCategoryId();
    }
    return sharedCategory;
  };

  let notebook = null;
  const sharedNotebook = async () => {
    if (!notebook) {
      notebook = await getOrCreateNotebookByTitle(
        SHARED_NOTEBOOK_TITLE,
        SHARED_NOTEBOOK_COLOR,
      );
    }
    return notebook;
  };

  // One row per distinct media in the bundle, however many notes point at it —
  // several notes on the same lecture are the normal case, and the caller uses
  // this to name what arrived and to offer the download.
  const mediaItems = new Map();
  const mediaKey = item => `${item.type}:${item.source_id}`;

  const resolveAnchor = async media => {
    if (media) {
      try {
        // ensureMediaItem also records the media as a shared import, for the
        // badge; the map keeps it to one call per distinct media per bundle
        // however many notes point at it.
        const key = `${media.type}:${media.source_id}`;
        const item = mediaItems.get(key) ?? (await ensureMediaItem(media));
        mediaItems.set(mediaKey(item), item);
        return {
          source_id: String(item.source_id),
          source_type: item.type,
          relatedItem: item,
        };
      } catch (error) {
        // The note is still worth having. Fall through to the notebook rather
        // than dropping it because its video couldn't be recreated.
        console.error('Could not attach imported note to its media:', error);
      }
    }

    const book = await sharedNotebook();
    return {
      source_id: String(book.id),
      source_type: 'notebook',
      relatedItem: book,
    };
  };

  for (const note of notes) {
    try {
      // The note keeps the rowid it had on the sender's device, which is what
      // makes opening the same bundle twice a no-op — the common way to hit
      // that being tapping the file again in Downloads. generateId is
      // Date.now() * 1000 + a random, so it is already a global id rather than
      // a per-device sequence, and nothing here orders by rowid.
      //
      // A rowid held by a note the user deleted is not a match: they threw it
      // away and are opening the file again, which reads as wanting it back.
      // The tombstone is dropped so the new note can take the rowid — notes is
      // FTS5 and a second INSERT at the same rowid would fail.
      let noteId = uidToRowId(note.uid);
      if (noteId != null) {
        const state = await getNoteRowState(noteId);
        if (state === 'live') {
          skipped.push({title: note.title || 'Untitled', rowid: noteId});
          continue;
        }
        if (state === 'deleted') await purgeNoteRow(noteId);
      } else {
        noteId = generateId();
      }

      const anchor = await resolveAnchor(note.media);

      await createNewNote(noteId, anchor.source_id, anchor.source_type);
      // Membership in the hidden category is the note's "came from someone
      // else" mark — see SHARED_NOTES_CATEGORY. Never fatal: a note without it
      // is a note missing a badge, not a failed import.
      try {
        await addItemToCategory(await sharedCategoryId(), noteId, 'note');
      } catch (error) {
        console.error('Could not mark the imported note as shared:', error);
      }

      // Insert images first: their new ids are what the content has to point
      // at, so the HTML can only be finalised once they all exist.
      const idMap = {};
      for (const image of note.images) {
        const newImageId = generateId();
        await saveImage(newImageId, noteId, image.data);
        idMap[image.id] = newImageId;
      }

      const content = remapImageIds(note.content, idMap);
      await updateNote(noteId, content, note.text_content);
      if (note.title) await updateNoteTitle(noteId, note.title);

      imported.push({
        rowid: noteId,
        source_id: anchor.source_id,
        source_type: anchor.source_type,
        // Carried the way the list query joins it, so tapping a media note
        // straight after the import has the item to open the player with
        // instead of waiting for a refetch.
        relatedItem: anchor.relatedItem,
        // Set here as well as in the DB so the badge is on the row the moment
        // it appears, not only after the list is refetched.
        is_shared_import: 1,
        noteTitle: note.title,
        title: note.title,
        content,
        text_content: note.text_content,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      failed.push({item: {title: note.title || 'Untitled'}, error});
    }
  }

  // Surface them without waiting for a refetch, the same way createNoteInstant
  // does for a locally-created note.
  if (imported.length) {
    const {setNotesList, setMainNotesList} = useNotesStore.getState();
    setNotesList(prev => [...imported, ...prev]);
    setMainNotesList(prev => [...imported, ...prev]);
  }

  return {
    succeeded: imported.length,
    failed,
    skipped,
    notebook,
    mediaItems: Array.from(mediaItems.values()),
  };
};
