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
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
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
 * Asks for the permission that makes MediaStore readable, and says whether the
 * app now holds it.
 *
 * Split by version because the single storage permission became per-type ones
 * in Android 13. Either audio or video counts as a yes — a user who allowed
 * only one still gets that half of their library kept by reference and
 * repairable, and refusing to use what was granted would help nobody.
 *
 * Worth calling only where the answer changes what happens next, since a
 * standing refusal returns quietly but a first one costs the user a dialog.
 */
export const ensureMediaReadPermission = async () => {
  if (Platform.OS !== 'android') return false;

  const wanted =
    Platform.Version >= 33
      ? [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        ]
      : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];

  try {
    const granted = await PermissionsAndroid.requestMultiple(wanted);
    // All of them, for the same reason hasMediaReadPermission wants all of
    // them: a half-granted library is one where some files open and some do
    // not, with nothing on screen saying which or why.
    return wanted.every(
      name => granted[name] === PermissionsAndroid.RESULTS.GRANTED,
    );
  } catch (error) {
    return false;
  }
};

/**
 * The MediaStore uri for the same file, or null when there isn't one worth
 * trusting. See FileMetaModule.resolveMediaStoreUri for what that means.
 *
 * Worth preferring over the uri a file arrived on, because a MediaStore uri is
 * not read through a per-file grant at all — it is read on the strength of the
 * media permission, so it outlives the task it arrived in and the app that sent
 * it.
 */
export const resolveMediaStoreUri = async uri => {
  if (!isContentUri(uri)) return null;
  try {
    return await FileMeta.resolveMediaStoreUri(uri);
  } catch (error) {
    return null;
  }
};

/** Whether the media permission is already held, without asking for it. */
export const hasMediaReadPermission = async () => {
  if (Platform.OS !== 'android') return false;

  const wanted =
    Platform.Version >= 33
      ? [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        ]
      : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];

  try {
    const checks = await Promise.all(
      wanted.map(name => PermissionsAndroid.check(name)),
    );
    // Every one of them, not any. Android 13 split a single media permission
    // into one per type, and this app plays both — so a grant covering audio
    // alone means every video in the library is unreadable while this
    // function cheerfully reports that media may be read. It said yes, the
    // gate let the user through, and the failure surfaced much later as a
    // lecture that would not open.
    return checks.every(Boolean);
  } catch (error) {
    return false;
  }
};

/**
 * A uri for the same file that will still work after this task ends, or null if
 * there isn't one.
 *
 * Every way in — the picker, an "open with", a share — ends up here, because
 * they all face the same question and used to answer it differently. A uri that
 * arrived on an intent is readable now and worthless tomorrow; what varies is
 * only which escape from that is available.
 *
 * Two of them, and MediaStore goes first even though it is the dearer question
 * to ask. Both survive a restart, so that is not what separates them: a
 * persistable grant is held by *this install* and every one of them is revoked
 * when the app is uninstalled, while a MediaStore uri is read on the strength
 * of the media permission and is still the file's address afterwards. Restore
 * the database onto a reinstalled app and the grant-held rows all point at
 * files they may no longer open, which is the one moment a library most needs
 * to come back intact. Taking the grant second keeps it for what MediaStore
 * cannot name at all — a document provider's own tree, a drive the scanner
 * does not index — because the alternative there is copying the whole file,
 * which is what referencing files in place exists to avoid.
 *
 * Never asks for the media permission, only reads it. PermissionGate refuses
 * to let the app start without it, so every arrival here already has it —
 * and if that ever stops being true, the honest fallback is the grant below
 * rather than a dialog fired from inside an import.
 */
export const durableUriFor = async uri => {
  if (!isContentUri(uri)) return null;

  if (await hasMediaReadPermission()) {
    const viaMediaStore = await resolveMediaStoreUri(uri);
    if (viaMediaStore) return viaMediaStore;
  }

  // Refused, or a file MediaStore has no name for. A grant still beats a copy.
  if (await takePersistableAccess(uri)) return uri;

  return null;
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
