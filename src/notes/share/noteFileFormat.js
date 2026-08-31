// noteFileFormat.js
//
// The on-disk shape of a shared note bundle (.atnote). One file carries one or
// more notes, self-contained: the editor HTML plus the base64 of every image it
// references, so a bundle opened on another device needs nothing from ours.
//
// Plain JSON on purpose. Android cannot actually restrict who opens a file —
// registering the extension and MIME type only makes audioTracker the app it
// routes to — so obfuscating the payload would buy nothing real while making
// the format harder to version and debug.

import {getImagesForNote, getNoteById} from '../richDB';

export const NOTE_FILE_EXTENSION = 'atnote';
export const NOTE_FILE_MIME = 'application/vnd.audiotracker.note';

// Identifies our files independently of the extension, which an email client
// or chat app may well strip or rename on the way through.
export const NOTE_FILE_MAGIC = 'audiotracker.notes';
export const NOTE_FILE_VERSION = 1;

// Images live in their own table keyed by note_rowid, and the editor HTML
// refers to them only by `data-image-id="<id>"` (the src in stored content is
// a grey placeholder — see processHtmlContent). Both note ids and image ids are
// reassigned on import, so the importer has to rewrite these references; this
// is the one pattern that has to stay in step between the two sides.
const IMAGE_ID_ATTR = /data-image-id="(\d+)"/g;

export const collectImageIds = html => {
  if (!html) return [];
  return Array.from(html.matchAll(IMAGE_ID_ATTR)).map(m => m[1]);
};

/**
 * Rewrites every data-image-id in `html` through `idMap` (old id -> new id).
 *
 * Ids not in the map are left alone rather than dropped: the image row may
 * simply have been missing from the bundle, and keeping the attribute leaves a
 * placeholder in place instead of silently mangling the markup.
 */
export const remapImageIds = (html, idMap) => {
  if (!html) return html;
  return html.replace(IMAGE_ID_ATTR, (whole, oldId) =>
    idMap[oldId] != null ? `data-image-id="${idMap[oldId]}"` : whole,
  );
};

/**
 * Builds the bundle for `noteItems` — the selection entries from
 * useSelectionStore ({id, title, ...}), or anything else carrying an `id`.
 *
 * Notes that can't be read are skipped rather than failing the whole bundle,
 * and reported back so the caller can tell the user which ones didn't make it.
 */
export const buildNoteBundle = async noteItems => {
  const notes = [];
  const failed = [];

  for (const item of noteItems) {
    try {
      const note = await getNoteById(item.id);
      if (!note || (!note.content && !note.title)) {
        throw new Error('Note is empty or no longer exists');
      }

      // Only the images this note's HTML actually references. getImagesForNote
      // can also return rows orphaned by edits that removed the <img> but never
      // ran deleteUnusedImages, and carrying those would bloat the file with
      // base64 nothing renders.
      const referenced = new Set(collectImageIds(note.content));
      const images = (await getImagesForNote(item.id))
        .filter(img => referenced.has(String(img.id)) && img.image_data)
        .map(img => ({id: String(img.id), data: img.image_data}));

      notes.push({
        title: note.title || item.title || '',
        content: note.content || '',
        text_content: note.text_content || '',
        images,
      });
    } catch (error) {
      failed.push({item, error});
    }
  }

  return {
    bundle: {
      format: NOTE_FILE_MAGIC,
      version: NOTE_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      notes,
    },
    failed,
  };
};

/**
 * Parses and validates file text. Throws with a message meant to be shown to
 * the user — every failure here is something they can act on (wrong file,
 * truncated download, a bundle from a newer build).
 */
export const parseNoteBundle = text => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This doesn't look like an audioTracker note file.");
  }

  if (!parsed || parsed.format !== NOTE_FILE_MAGIC) {
    throw new Error("This doesn't look like an audioTracker note file.");
  }

  if (typeof parsed.version !== 'number' || parsed.version > NOTE_FILE_VERSION) {
    throw new Error(
      'This note file was made with a newer version of audioTracker. Update the app to open it.',
    );
  }

  if (!Array.isArray(parsed.notes) || parsed.notes.length === 0) {
    throw new Error('This note file has no notes in it.');
  }

  // Normalize rather than trusting field-by-field: a hand-edited or
  // partially-written file shouldn't be able to put undefined into a DB column.
  return parsed.notes.map(note => ({
    title: typeof note?.title === 'string' ? note.title : '',
    content: typeof note?.content === 'string' ? note.content : '',
    text_content: typeof note?.text_content === 'string' ? note.text_content : '',
    images: Array.isArray(note?.images)
      ? note.images
          .filter(img => img && img.id != null && typeof img.data === 'string')
          .map(img => ({id: String(img.id), data: img.data}))
      : [],
  }));
};
