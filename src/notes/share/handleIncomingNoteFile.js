// handleIncomingNoteFile.js
//
// Single intercept point for .atnote files arriving from outside the app,
// whether as a VIEW intent (tapping the file in a downloads/file manager) or a
// SEND intent (sharing it into audioTracker). Both LinkHandler and ShareHandler
// otherwise funnel everything into handleLinkSubmit, which would try to read a
// note bundle as a media link.

import {Alert} from 'react-native';
import {importNoteFile} from './importNoteFile';
import {NOTE_FILE_EXTENSION, NOTE_FILE_MIME} from './noteFileFormat';

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
    const {succeeded, failed, notebook} = await importNoteFile(uri);

    if (!succeeded) {
      Alert.alert('Import Failed', 'None of the notes in this file could be imported.');
      return true;
    }

    const noun = succeeded === 1 ? 'note' : 'notes';
    const partial = failed.length ? ` ${failed.length} could not be imported.` : '';
    Alert.alert(
      'Notes Imported',
      `Added ${succeeded} ${noun} to "${notebook.title}".${partial}`,
    );
  } catch (error) {
    // parseNoteBundle throws messages written for the user.
    Alert.alert('Could Not Open File', error?.message || 'This file could not be read.');
  }
  return true;
};
