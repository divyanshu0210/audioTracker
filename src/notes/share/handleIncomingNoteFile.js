// handleIncomingNoteFile.js
//
// Single intercept point for .atnote files arriving from outside the app,
// whether as a VIEW intent (tapping the file in a downloads/file manager) or a
// SEND intent (sharing it into audioTracker). Both LinkHandler and ShareHandler
// otherwise funnel everything into handleLinkSubmit, which would try to read a
// note bundle as a media link.

import {Alert} from 'react-native';
import RNFS from 'react-native-fs';
import {importNoteFile} from './importNoteFile';
import {
  NOTE_FILE_EXTENSION,
  NOTE_FILE_MAGIC,
  NOTE_FILE_MIME,
} from './noteFileFormat';
import {
  getFileMeta,
  isAudioOrVideo,
} from '../../Linking/utils/handleLinkSubmit';

/**
 * Whether an incoming item is one of our note bundles.
 *
 * Checks the MIME type first — that's what our own share sets and it survives
 * a content:// URI, which typically carries no filename at all. The extension
 * check is the fallback for everything that strips or rewrites the type on the
 * way through (most mail and chat apps send application/octet-stream).
 */
export const looksLikeNoteFile = (uri, mimeType) => {
  if (mimeType && mimeType.toLowerCase() === NOTE_FILE_MIME) return true;
  if (typeof uri !== 'string') return false;
  // Drop any query/fragment before looking at the extension.
  const path = uri.split(/[?#]/)[0];
  return path.toLowerCase().endsWith(`.${NOTE_FILE_EXTENSION}`);
};

// Enough to cover `{"format":"audiotracker.notes",…` many times over — the
// magic is the first key buildNoteBundle writes, so it lands within the first
// few dozen bytes. Read as ascii rather than utf8 because a fixed byte count
// can split a multi-byte character, which utf8 decoding would throw on; the
// magic is plain ASCII either way.
const SNIFF_BYTES = 512;

/**
 * Whether the file itself says it is ours, whatever it happens to be called.
 *
 * The last resort, and the only signal that cannot be stripped in transit.
 * RNFS.read goes through ContentResolver.openInputStream, so it works on a
 * content:// URI, and reads only the first bytes — sniffing a video that
 * turned out not to be ours costs one open and 512 bytes.
 */
const hasNoteFileMagic = async uri => {
  try {
    // file:// paths need unwrapping the way importNoteFile's readSharedFile
    // does; content:// URIs are passed through untouched.
    const target = uri.startsWith('file://')
      ? decodeURIComponent(uri.slice(7))
      : uri;
    const head = await RNFS.read(target, SNIFF_BYTES, 0, 'ascii');
    return typeof head === 'string' && head.includes(NOTE_FILE_MAGIC);
  } catch (error) {
    // Unreadable, gone, or a provider that will not stream it. Not ours as far
    // as we can tell — let the link handler have it, which is what happened
    // before any of these checks existed.
    console.log('Could not read the head of an incoming file:', error);
    return false;
  }
};

/**
 * The same question, asked of the file rather than of the URI.
 *
 * A bundle opened from Downloads arrives as content://…/document/msf%3A42
 * with type application/octet-stream: no extension in the path, and a type
 * assigned by a provider that has never heard of ".atnote". Both of the
 * signals looksLikeNoteFile reads are gone, and the file used to fall through
 * to handleLinkSubmit, which tried to make a media item out of it and said
 * "Invalid URL" — the one route users actually take, failing.
 *
 * Three answers, cheapest first. The MIME type and the URI cost nothing. The
 * display name (OpenableColumns, via FileMeta) survives a content:// URI and
 * usually carries the extension. And when even that is gone — a provider that
 * reports no extension, or an app that renamed the file on the way through —
 * the content itself still says so, which is the only signal nothing in
 * transit can strip.
 */
export const resolvesToNoteFile = async (uri, mimeType) => {
  if (looksLikeNoteFile(uri, mimeType)) return true;
  if (typeof uri !== 'string') return false;
  // Only files get looked inside. An http(s) link is a media link by
  // definition and belongs to handleLinkSubmit.
  if (!uri.startsWith('content://') && !uri.startsWith('file://')) return false;

  // A stated audio or video type is an answer on its own, and the cheapest one
  // available: a bundle is JSON, and nothing that hands us audio/mpeg is
  // holding one. Worth its own branch because everything below is a round trip
  // through the content provider, and on a shared song those cost seconds
  // before anything reaches the screen — the sniff was reading the head of
  // every incoming media file to rule out a format it could not have been.
  //
  // The uncertain case this is not: application/octet-stream, which is what a
  // bundle out of Downloads arrives as and what the checks below exist for.
  if (isAudioOrVideo(mimeType)) return false;

  let name = null;
  let mime = null;
  if (uri.startsWith('content://')) {
    try {
      ({name, mime} = await getFileMeta(uri));
      if (looksLikeNoteFile(name, mime)) return true;
      // Same answer, now that the provider has given us a type the sender
      // didn't. Saves the read, which is the expensive half.
      if (isAudioOrVideo(mime)) return false;
    } catch (error) {
      // getFileMeta swallows its own failures; this is for a missing native
      // module. Fall through to the content check rather than giving up.
      console.log('Could not read the display name of an incoming file:', error);
    }
  }

  if (await hasNoteFileMagic(uri)) return true;

  // Logged because this is the branch that sends a file to the link handler,
  // and "Unsupported file" on a bundle that is genuinely ours is otherwise
  // impossible to diagnose from the outside.
  console.log('Incoming file is not a note bundle:', {uri, name, mime});
  return false;
};

/**
 * Imports the bundle and tells the user where it went.
 *
 * Returns true when the file was ours and handled — callers use that to stop
 * before passing it on to handleLinkSubmit. A parse failure still counts as
 * handled: it was addressed to us, it just wasn't valid, and falling through
 * to the link handler afterwards would produce a second, more confusing error.
 */
export const handleIncomingNoteFile = async uri => {
  try {
    const {succeeded, failed, skipped, notebook} = await importNoteFile(uri);

    // Opening a bundle that is entirely already here is the normal outcome of
    // tapping the same file twice, not a failure — and it used to be reported
    // as one the moment nothing new was inserted.
    //
    // It is also what sharing a note to yourself does: the bundle carries the
    // note's own rowid, so on the device it came from it always matches the
    // original. Hence "already here" rather than "already imported" — on this
    // device it was never imported, it is simply the note itself.
    if (!succeeded && skipped.length) {
      const subject = skipped.length === 1 ? 'This note' : 'These notes';
      Alert.alert(
        `${subject} already exists.`,
      );
      return true;
    }

    if (!succeeded) {
      Alert.alert('Import Failed', 'None of the notes in this file could be imported.');
      return true;
    }

    const noun = succeeded === 1 ? 'note' : 'notes';
    const already = skipped.length
      ? ` ${skipped.length} ${skipped.length === 1 ? 'was' : 'were'} already imported.`
      : '';
    const partial =
      (failed.length ? ` ${failed.length} could not be imported.` : '') + already;
    // Only mention the notebook if something actually went into it — with the
    // media attached, usually nothing does.
    const where = notebook ? ` to "${notebook.title}"` : '';
    const body = `Added ${succeeded} ${noun}${where}.${partial}`;

    // Says nothing about the media the notes came attached to, and nothing
    // about downloading it. Someone who has just opened a file has not read
    // the notes yet: the recordings are not a decision, and naming them is not
    // yet information. Both belong later — the notes are in All Notes with a
    // badge, and the download offer is in the player, where it is asked for
    // (see MediaUnavailable).
    Alert.alert('Notes Imported', body);
  } catch (error) {
    // parseNoteBundle throws messages written for the user.
    Alert.alert('Could Not Open File', error?.message || 'This file could not be read.');
  }
  return true;
};
