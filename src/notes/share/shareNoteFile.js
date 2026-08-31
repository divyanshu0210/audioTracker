// shareNoteFile.js
//
// Writes a .atnote bundle to the cache directory and hands it to the system
// share sheet. One file per share, however many notes are in it — a single
// attachment travels through mail/chat far more reliably than N of them, and
// Share.open is a single native sheet that can't be opened once per file
// anyway (same reasoning as bulkShareNotesAsPdf).

import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {
  buildNoteBundle,
  NOTE_FILE_EXTENSION,
  NOTE_FILE_MIME,
} from './noteFileFormat';

// Everything Android dislikes in a display filename, plus leading dots so a
// title starting with "." can't produce a hidden file.
const sanitizeFileName = name =>
  (name || '')
    .replace(/[\/\?%*:|"<>\x00-\x1F]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 60);

// Kept short enough that a long note title plus the "and N more" suffix still
// leaves a filename that displays in full in a chat or mail attachment row.
const MAX_TITLE_IN_COMPOSITE = 40;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Names the bundle after what's actually in it.
 *
 * The recipient sees this filename in their downloads or attachment list with
 * no other context, and the sender sees it in the share sheet, so it has to say
 * something: leading with a real note title does that, while a bare count
 * ("3 notes") describes every bundle ever shared and collides in Downloads.
 * Dates only appear where there's no title to lead with — they're a fallback
 * for identifying an otherwise anonymous file, not decoration.
 */
const bundleFileName = notes => {
  const leadTitle = sanitizeFileName(notes[0]?.title);

  if (notes.length === 1) {
    // An untitled single note used to fall through to the plural branch and
    // come out as "1 notes".
    return leadTitle
      ? `${leadTitle}.${NOTE_FILE_EXTENSION}`
      : `Note ${today()}.${NOTE_FILE_EXTENSION}`;
  }

  if (leadTitle) {
    const others = notes.length - 1;
    const lead = leadTitle.slice(0, MAX_TITLE_IN_COMPOSITE).trim();
    return `${lead} and ${others} more.${NOTE_FILE_EXTENSION}`;
  }

  return `${notes.length} Notes ${today()}.${NOTE_FILE_EXTENSION}`;
};

/**
 * Shares `noteItems` as a single .atnote file.
 *
 * Returns {succeeded, failed} in the same shape as the other bulk actions, so
 * callers can report partial failures with describeFailures. Throws only if
 * the share itself fails — including plain user cancellation, which
 * react-native-share reports as a rejection (see handleShareAsPdf).
 */
export const shareNotesAsFile = async noteItems => {
  const {bundle, failed} = await buildNoteBundle(noteItems);

  if (!bundle.notes.length) {
    return {succeeded: 0, failed};
  }

  // Cache, not Documents: these are throwaway copies the OS may reclaim, and
  // they shouldn't accumulate in anything the user backs up.
  const path = `${RNFS.CachesDirectoryPath}/${bundleFileName(bundle.notes)}`;
  await RNFS.writeFile(path, JSON.stringify(bundle), 'utf8');

  await Share.open({
    url: `file://${path}`,
    // A custom type is what lets the receiving side route this back to us.
    // Some targets ignore it and fall back to the extension, which is why the
    // manifest matches on both.
    type: NOTE_FILE_MIME,
    title: bundle.notes.length === 1 ? 'Share Note' : 'Share Notes',
    failOnCancel: false,
  });

  return {succeeded: bundle.notes.length, failed};
};
