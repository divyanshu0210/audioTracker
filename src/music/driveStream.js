// driveStream.js
//
// Playback urls for the two kinds of file the player cannot open by itself.
//
// libVLC takes an MRL and nothing else — no request headers, no content
// resolver — so both of these have to reach it as a plain http://127.0.0.1/...
// url served by the loopback proxy in
// android/app/src/main/java/com/audiotracker/drivestream/DriveStreamServer.java:
//
//   A Drive file needs an `Authorization: Bearer` header, and the VLC binding
//   has no way to send one. It cannot be handed over the way an Iskcon file is
//   (see iskconActions.ensureDbItem, which puts the remote url straight into
//   file_path), so the proxy attaches the header on the way out.
//
//   A device file lives behind a content:// uri, which the binding flags as a
//   network source and mangles into `file:////content%3A//...`. Resolving it
//   through the proxy is what lets an import stay where the user keeps it
//   rather than being copied into the app, which used to double what every
//   imported file cost on disk.
//
// Nothing here writes a stream url to the database. It is valid only for this
// process (the port and the path secret are chosen at server start), so a
// persisted one would be dead on the next launch, and would ride into Drive
// backups as a file_path that restores to nothing. Stream urls belong in
// navigation params and player state only.

import {NativeModules} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';

import {isContentUri, mediaExists} from '../utils/mediaFile';
import {repairDeviceFile} from '../utils/fileIdentity';

const {DriveStream} = NativeModules;

// One start() per process, shared by every caller. Cleared on failure so a
// later attempt can retry rather than handing back the same rejection forever.
let basePromise = null;

const getBaseUrl = () => {
  if (!basePromise) {
    basePromise = DriveStream.start().catch(error => {
      basePromise = null;
      throw error;
    });
  }
  return basePromise;
};

export const isStreamUrl = path =>
  typeof path === 'string' && path.startsWith('http');

export {isContentUri};

/** The proxy url for a Drive file id. Starts the server on first use. */
export const getDriveStreamUrl = async sourceId => {
  const base = await getBaseUrl();
  return `${base}/drive/${encodeURIComponent(sourceId)}`;
};

/** The proxy url for a device file's content:// uri. Starts the server too. */
export const getContentStreamUrl = async uri => {
  const base = await getBaseUrl();
  return `${base}/content/${encodeURIComponent(uri)}`;
};

const isOffline = async () => {
  try {
    const state = await NetInfo.fetch();
    // isInternetReachable is null until the first probe resolves; only a
    // definite false counts, so a slow probe never blocks a stream.
    return !state.isConnected || state.isInternetReachable === false;
  } catch {
    return false;
  }
};

/**
 * What to actually play a Drive item from, or null if nothing can be played
 * right now.
 *
 * A local copy always wins: it costs no data, survives losing signal, and is
 * the file the user explicitly asked to have. Streaming is the fallback, and
 * with no connection there is no fallback — returning null there leaves
 * file_path empty, which is what makes the player show MediaUnavailable with
 * its download offer instead of a stream that cannot load.
 */
/**
 * The Drive file id a row's bytes can be streamed from, or null.
 *
 * A drive_file is its own address. A device_file is not — it is bytes on
 * someone's phone — but once a copy has been uploaded to Drive it has an id
 * like any other, and that copy is exactly what an assignment or a shared note
 * hands over. Streaming it needs nothing the row does not already carry.
 */
const streamableDriveId = item => {
  if (item?.type === 'drive_file') return item.source_id ?? null;
  if (item?.type === 'device_file') return item.drive_file_id ?? null;
  return null;
};

export const resolvePlaybackPath = async item => {
  // A content:// uri is the file itself rather than a copy of it, so there is
  // nothing to prefer over it and nothing to fetch first — it only needs the
  // proxy to become something the player can open. Checked before the Drive
  // branch so a device file that also has an uploaded copy plays through the
  // user's own file rather than over the network.
  //
  // The picker asks for local sources only (see pickAndImportDeviceFiles), so
  // in practice these bytes are on this phone and this needs no connection.
  // What it does not survive is the user moving or deleting the file, which is
  // what uploading a copy to Drive is for — see shareDeviceFile.
  if (isContentUri(item?.file_path)) {
    let path = item.file_path;

    // The uri may have stopped working since it was stored: a share's grant
    // dies with the task that received it, and a file the user moved leaves its
    // old address pointing at nothing. Either way the bytes are usually still
    // on the phone under a new name, and this is the right moment to go looking
    // — the user has just asked for this file in particular, so a permission
    // prompt here buys them the thing they are waiting for rather than
    // interrupting something else.
    //
    // Checked rather than attempted, because handing a dead uri to the proxy
    // fails silently: the player sits at 00:00 and the log says
    // "no permission" where nobody is looking.
    if (!(await mediaExists(path))) {
      path = await repairDeviceFile(item, {retry: true});
    }

    if (path) {
      try {
        return await getContentStreamUrl(path);
      } catch (error) {
        console.error('Could not start the stream proxy:', error);
        return null;
      }
    }

    // The file is gone and could not be found again. If a copy was ever
    // uploaded, that copy is the last thing that can play this — so this falls
    // through to the Drive branch below rather than giving up, which is the
    // whole reason for uploading one. Without the fall-through a backed-up
    // file showed the unavailable screen while a perfectly good copy sat in
    // the user's Drive.
    //
    // With no copy there is genuinely nothing: returned here rather than let
    // through, because the branch below would hand the player the dead uri.
    if (!item?.drive_file_id) return null;
  }

  const driveId = streamableDriveId(item);
  if (!driveId) {
    return item?.file_path ?? null;
  }

  if (isStreamUrl(item.file_path)) return item.file_path;

  // Skipped for a uri, which RNFS cannot stat anyway — reaching here with one
  // means it was already found to be unreadable above.
  if (item.file_path && !isContentUri(item.file_path)) {
    try {
      if (await RNFS.exists(item.file_path)) return item.file_path;
    } catch (error) {
      console.warn('Could not check the downloaded copy:', error);
    }
  }

  if (await isOffline()) return null;

  try {
    return await getDriveStreamUrl(driveId);
  } catch (error) {
    console.error('Could not start the Drive stream proxy:', error);
    return null;
  }
};
