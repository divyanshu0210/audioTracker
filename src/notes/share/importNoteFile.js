// importNoteFile.js
//
// Reads a .atnote bundle and inserts its notes into the local DB.
//
// Imported notes always land in a dedicated "Shared Notes" notebook: a note
// arriving from another device is anchored (source_type + source_id) to media
// that device had and this one may not, so re-attaching it isn't generally
// possible. A notebook is the one home that always exists, and keeping imports
// in their own gives an obvious place to look after opening a file.

import RNFS from 'react-native-fs';
import {getOrCreateNotebookByTitle} from '../../database/C';
import {generateId} from '../useNoteController';
import {createNewNote, saveImage, updateNote, updateNoteTitle} from '../richDB';
import {useNotesStore} from '../../stores/useNotesStore';
import {parseNoteBundle, remapImageIds} from './noteFileFormat';

export const SHARED_NOTEBOOK_TITLE = 'Shared Notes';
const SHARED_NOTEBOOK_COLOR = '#8B5CF6';

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
 * are rewritten to match (see remapImageIds).
 *
 * Returns {succeeded, failed, notebook}. Individual notes that fail are
 * skipped rather than aborting the import — one malformed note in a bundle of
 * twenty shouldn't cost the other nineteen.
 */
export const importNoteFile = async uri => {
  const text = await readSharedFile(uri);
  const notes = parseNoteBundle(text);

  const notebook = await getOrCreateNotebookByTitle(
    SHARED_NOTEBOOK_TITLE,
    SHARED_NOTEBOOK_COLOR,
  );

  const imported = [];
  const failed = [];

  for (const note of notes) {
    try {
      const noteId = generateId();
      await createNewNote(noteId, String(notebook.id), 'notebook');

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
        source_id: String(notebook.id),
        source_type: 'notebook',
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

  return {succeeded: imported.length, failed, notebook};
};
