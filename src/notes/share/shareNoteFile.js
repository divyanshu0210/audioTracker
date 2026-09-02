// shareNoteFile.js
//
// Writes a .atnote bundle to the cache directory and hands it to the system
// share sheet. One file per share, however many notes are in it — a single
// attachment travels through mail/chat far more reliably than N of them, and
// Share.open is a single native sheet that can't be opened once per file
// anyway (same reasoning as bulkShareNotesAsPdf).

import {Alert} from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import {
  buildNoteBundle,
  NOTE_FILE_EXTENSION,
  NOTE_FILE_MIME,
} from './noteFileFormat';
import {MEDIA_NOT_SHARED} from './noteMedia';
import {shareDeviceFile} from '../../share/shareDeviceFile';

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

// The device files in a selection that have no Drive copy yet, one entry per
// file however many notes were taken on it.
const unsharedDeviceFiles = unshared => {
  const byId = new Map();
  for (const entry of unshared) {
    if (entry.reason !== MEDIA_NOT_SHARED || !entry.mediaItem) continue;
    byId.set(entry.mediaItem.id, entry.mediaItem);
  }
  return Array.from(byId.values());
};

/**
 * Asks what to do about notes whose media can't travel.
 *
 * Only device files reach here. Everything else in the library is already
 * reachable from a link the recipient can follow, and a note whose media row
 * is simply gone has nothing to offer the user — it behaves like an unattached
 * note on this device too, so it goes quietly.
 *
 * Kept to two sentences. It is a dialog interrupting a share, not
 * documentation: the only things it has to carry are why the media can't go,
 * that uploading makes a link anyone can open, and that the share has to be
 * repeated afterwards. The three buttons say the rest.
 *
 * Resolves 'share', 'upload' or 'cancel'.
 */
const askAboutUnsharedMedia = files =>
  new Promise(resolve => {
    // Named inline for one file, listed for several — a bullet list of one
    // reads like a form.
    const lead =
      files.length === 1
        ? `"${files[0].title}" is only on this device, so its timestamps won't work for the recipient.`
        : `These files are only on this device, so their timestamps won't work for the recipient:\n\n${files
            .map(f => `• ${f.title}`)
            .join('\n')}`;

    Alert.alert(
      'Send the media too?',
      `${lead}\n\nUploading puts a copy in your Drive, with a link anyone who has it can open. Share again once it finishes.`,
      [
        {text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel')},
        {text: 'Notes only', onPress: () => resolve('share')},
        {text: 'Upload', onPress: () => resolve('upload')},
      ],
      {cancelable: true, onDismiss: () => resolve('cancel')},
    );
  });

/**
 * Shares `noteItems` as a single .atnote file.
 *
 * Returns {succeeded, failed} in the same shape as the other bulk actions, so
 * callers can report partial failures with describeFailures. A share the user
 * backed out of returns 0 succeeded with nothing failed, which reports as
 * nothing at all — the same as cancelling the share sheet. Throws only if the
 * share itself fails — including plain user cancellation, which
 * react-native-share reports as a rejection (see handleShareAsPdf).
 */
export const shareNotesAsFile = async noteItems => {
  const {bundle, failed, unshared} = await buildNoteBundle(noteItems);

  if (!bundle.notes.length) {
    return {succeeded: 0, failed};
  }

  const pendingUploads = unsharedDeviceFiles(unshared);
  if (pendingUploads.length) {
    const answer = await askAboutUnsharedMedia(pendingUploads);
    if (answer === 'cancel') return {succeeded: 0, failed};
    if (answer === 'upload') {
      // Deliberately does not then share: the Drive id the bundle needs only
      // exists once the upload lands, and holding the share sheet open behind
      // a transfer that can take minutes — and that survives the app being
      // killed — would be worse than asking for a second tap.
      for (const file of pendingUploads) {
        await shareDeviceFile(file);
      }
      return {succeeded: 0, failed};
    }
  }

  // Cache, not Documents: these are throwaway copies the OS may reclaim, and
  // they shouldn't accumulate in anything the user backs up.
  const path = `${RNFS.CachesDirectoryPath}/${bundleFileName(bundle.notes)}`;
  await RNFS.writeFile(path, JSON.stringify(bundle), 'utf8');

  // Deliberately not awaited.
  //
  // When the chosen target is audioTracker itself — sharing a note to this
  // same device — the chooser dismisses by delivering the SEND intent back to
  // our own singleTask activity, which arrives as onNewIntent. No activity
  // *result* is ever produced, so react-native-share waits forever and this
  // promise never settles. Anything awaiting it waits with it: that is what
  // left the spinner in SelectionHeader turning after a share to self.
  //
  // Nothing below depends on the outcome. The counts are already known, the
  // chooser is modal so there is no app UI to keep disabled behind it, and
  // failOnCancel:false already makes an ordinary cancel a non-event. A real
  // failure is logged rather than thrown — the same thing every caller did
  // with it anyway.
  Share.open({
    url: `file://${path}`,
    // A custom type is what lets the receiving side route this back to us.
    // Some targets ignore it and fall back to the extension, which is why the
    // manifest matches on both.
    type: NOTE_FILE_MIME,
    title: bundle.notes.length === 1 ? 'Share Note' : 'Share Notes',
    failOnCancel: false,
  }).catch(error => console.log('Share sheet closed or failed:', error));

  return {succeeded: bundle.notes.length, failed};
};
