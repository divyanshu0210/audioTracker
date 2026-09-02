// noteFileFormat.js
//
// The on-disk shape of a shared note bundle (.atnote). One file carries one or
// more notes, self-contained: the editor HTML plus the base64 of every image it
// references, so a bundle opened on another device needs nothing from ours.
//
// Since version 2 a note also carries the media it was taken against — a
// reference, not the bytes: enough for the recipient's app to recreate the row
// and reach the same recording (see noteMedia). That is what makes the
// timestamps in a shared note do anything; before it, they were buttons with
// no player behind them.
//
// Plain JSON on purpose. Android cannot actually restrict who opens a file —
// registering the extension and MIME type only makes audioTracker the app it
// routes to — so obfuscating the payload would buy nothing real while making
// the format harder to version and debug.

import {getImagesForNote, getNoteById} from '../richDB';
import {describeNoteMedia, parseMediaDescriptor} from './noteMedia';

export const NOTE_FILE_EXTENSION = 'atnote';
export const NOTE_FILE_MIME = 'application/vnd.audiotracker.note';

// Identifies our files independently of the extension, which an email client
// or chat app may well strip or rename on the way through.
export const NOTE_FILE_MAGIC = 'audiotracker.notes';
// 2 added per-note media. Bumped rather than sneaked in unversioned because
// an older build reading a v2 file has to say so instead of importing the
// notes and silently dropping the half that makes them work.
// 3 added per-note uid, which is what makes re-importing a bundle idempotent.
export const NOTE_FILE_VERSION = 3;

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
 *
 * `unshared` is the third outcome, and a softer one: the note itself is fine,
 * but the media behind it can't be referenced from another device (a file off
 * this phone with no copy uploaded yet). The note still goes in the bundle —
 * text and images are most of it — so this is something to tell the sender
 * about, not a failure to abort on.
 */
export const buildNoteBundle = async noteItems => {
  const notes = [];
  const failed = [];
  const unshared = [];

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

      // Never fatal: a note whose media can't be described is still worth
      // sharing, it just arrives unattached the way every note did before.
      let media = null;
      try {
        const described = await describeNoteMedia(note);
        if (described?.media) {
          media = described.media;
        } else if (described?.reason) {
          unshared.push({
            item,
            reason: described.reason,
            mediaItem: described.item ?? null,
          });
        }
      } catch (error) {
        console.error('Could not describe the media for a shared note:', error);
      }

      notes.push({
        // The note's id on this device, carried so the receiving side can
        // recognise the same note arriving twice. Only ever compared, never
        // used as a local id — the importer always allocates its own.
        uid: String(item.id),
        title: note.title || item.title || '',
        content: note.content || '',
        text_content: note.text_content || '',
        images,
        ...(media ? {media} : {}),
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
    unshared,
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
    // Absent in v1 and v2 files. Those import the way they always did — every
    // note new every time — because there is nothing in them to match on.
    uid:
      note?.uid == null || note.uid === '' ? null : String(note.uid),
    title: typeof note?.title === 'string' ? note.title : '',
    content: typeof note?.content === 'string' ? note.content : '',
    text_content: typeof note?.text_content === 'string' ? note.text_content : '',
    images: Array.isArray(note?.images)
      ? note.images
          .filter(img => img && img.id != null && typeof img.data === 'string')
          .map(img => ({id: String(img.id), data: img.data}))
      : [],
    // Absent in v1 files, and null for a notebook note in any version — both
    // land the note in the notebook, which is what the importer already did
    // for everything.
    media: parseMediaDescriptor(note?.media),
  }));
};
