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
    return wanted.some(
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
    return checks.some(Boolean);
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
 * Two of them, cheapest first. A sender that attached a persistable grant means
 * the uri it sent is already permanent. Failing that, an ordinary media file in
 * shared storage has a MediaStore uri of its own, which needs no grant at all —
 * it is read on the strength of the media permission, so it outlives both the
 * task and the app that sent it.
 *
 * `prompt` is the difference between a decision and a glance. Keeping a file is
 * a deliberate act and can fairly ask for a permission; a file shared in to be
 * watched once should not put a system dialog in front of someone who only
 * tapped play, so that path takes the permission if it already has it and
 * otherwise lets the uri be temporary.
 */
export const durableUriFor = async (uri, {prompt = false} = {}) => {
  if (!isContentUri(uri)) return null;

  if (await takePersistableAccess(uri)) return uri;

  const allowed = prompt
    ? await ensureMediaReadPermission()
    : await hasMediaReadPermission();
  if (!allowed) return null;

  return await resolveMediaStoreUri(uri);
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
