// mediaFile.js
//
// One question, asked from a dozen places: are this item's bytes reachable
// right now, and what does giving them up mean?
//
// Both used to have one answer each, because a device file's bytes were always
// a copy the app had made — RNFS.exists to ask, RNFS.unlink to drop. An
// imported file is now normally left where the user keeps it, with the row
// holding its content:// uri instead (see resolveImportPath in
// src/Linking/utils/handleLinkSubmit.js), and RNFS cannot stat a uri: it would
// report every referenced file missing, emptying the Device list and putting
// the unavailable screen in front of files that play fine.

import RNFS from 'react-native-fs';
import {NativeModules} from 'react-native';
import {releaseLongTermAccess} from '@react-native-documents/picker';

const {FileMeta} = NativeModules;

export const isContentUri = path =>
  typeof path === 'string' && path.startsWith('content://');

/**
 * Whether an item's bytes can be read right now — copy or reference alike.
 *
 * Never throws. Every caller is deciding whether to show a row or an
 * unavailable state, and a rejection there reads as a crash rather than as an
 * answer, so an unreachable file and an unanswerable question are both "no".
 */
export const mediaExists = async path => {
  if (!path) return false;
  try {
    return isContentUri(path)
      ? await FileMeta.isReadable(path)
      : await RNFS.exists(path);
  } catch (error) {
    return false;
  }
};

/**
 * Tries to hold on to a uri for good. True when the app may still read it
 * after a restart, false when the grant only lasts this session.
 *
 * Ask before copying, never instead of checking: a false here means the bytes
 * have to be copied to be kept, and a row storing a uri this returned false
 * for is one that will be dead on the next launch.
 */
export const takePersistableAccess = async uri => {
  if (!isContentUri(uri)) return false;
  try {
    return await FileMeta.takePersistableAccess(uri);
  } catch (error) {
    return false;
  }
};

/**
 * Give up an item's bytes.
 *
 * The asymmetry is the whole point. A copy the app made is the app's to
 * delete. A referenced file is the user's, sitting in their own storage, and
 * removing it from this library gives back the grant and touches nothing else
 * — deleting someone's recording because they tidied their library is not a
 * thing this app gets to do, and is exactly what unlink would have done here
 * if it could reach that far.
 */
export const releaseMedia = async path => {
  if (!path) return;

  if (isContentUri(path)) {
    try {
      await releaseLongTermAccess([path]);
    } catch (error) {
      // A grant that is already gone is the state we wanted anyway.
      console.warn('Could not release access to', path, error);
    }
    return;
  }

  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch (error) {
    console.warn('Could not delete', path, error);
  }
};
