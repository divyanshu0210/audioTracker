// driveStream.js
//
// Streaming for Drive files, so playing one no longer means downloading it
// first.
//
// A Drive file cannot simply be handed to the player the way an Iskcon file is
// (see iskconActions.ensureDbItem, which puts the remote url straight into
// file_path): Drive's media endpoint needs an `Authorization: Bearer` header,
// and the VLC binding has no way to send one. So the native side runs a
// loopback proxy that attaches the header, and what the player gets is a
// header-free http://127.0.0.1/... url pointing at it — see
// android/app/src/main/java/com/audiotracker/drivestream/DriveStreamServer.java.
//
// Nothing here writes a stream url to the database. It is valid only for this
// process (the port and the path secret are chosen at server start), so a
// persisted one would be dead on the next launch, and would ride into Drive
// backups as a file_path that restores to nothing. Stream urls belong in
// navigation params and player state only.

import {NativeModules} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';

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

/** The proxy url for a Drive file id. Starts the server on first use. */
export const getDriveStreamUrl = async sourceId => {
  const base = await getBaseUrl();
  return `${base}/drive/${encodeURIComponent(sourceId)}`;
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
export const resolveDrivePlaybackPath = async item => {
  if (!item || item.type !== 'drive_file' || !item.source_id) {
    return item?.file_path ?? null;
  }

  if (isStreamUrl(item.file_path)) return item.file_path;

  if (item.file_path) {
    try {
      if (await RNFS.exists(item.file_path)) return item.file_path;
    } catch (error) {
      console.warn('Could not check the downloaded copy:', error);
    }
  }

  if (await isOffline()) return null;

  try {
    return await getDriveStreamUrl(item.source_id);
  } catch (error) {
    console.error('Could not start the Drive stream proxy:', error);
    return null;
  }
};
