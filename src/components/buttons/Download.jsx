// Where a downloaded Drive file lands.
//
// Shared rather than recomputed by each caller: the Drive menu's Download
// entry, the player's recovery panel and the bulk actions all have to agree on
// the path, or a file downloaded through one route is invisible to the others
// and gets fetched a second time.
//
// The button that used to live here is gone. A Drive file streams now, so
// downloading is one entry in the row's menu (see DriveMenuItems) instead of
// the row's only action.

import {ToastAndroid} from 'react-native';
import RNFS from 'react-native-fs';
import {enqueueDownload} from '../../backgroundService/backgroundDownloadService';

export const getLocalFilePath = (sourceId, fileName) => {
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sanitizedSourceId = sourceId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${RNFS.ExternalDirectoryPath}/${sanitizedSourceId}_${sanitizedFileName}`;
};

/**
 * Start a background download of a Drive file, if it isn't already on disk.
 *
 * Shared so the row menu and the "this has to be downloaded first" prompt
 * cannot drift apart on the endpoint, the local path or the auth flag — three
 * things that have to match exactly, or a file fetched by one route is
 * invisible to the other and gets pulled down twice.
 *
 * MediaUnavailable deliberately keeps its own call: it renders its own
 * progress and failure states, so the toasts here would talk over it.
 */
export const enqueueDriveDownload = async item => {
  const localPath = getLocalFilePath(item.source_id, item.title);

  if (await RNFS.exists(localPath)) {
    ToastAndroid.show('Already downloaded', ToastAndroid.SHORT);
    return;
  }

  await enqueueDownload({
    id: item.id,
    sourceId: item.source_id,
    title: item.title,
    url: `https://www.googleapis.com/drive/v3/files/${item.source_id}?alt=media`,
    localPath,
    type: item.type,
    mimeType: item.mimeType,
    googleAuth: true,
  });

  ToastAndroid.show(
    'Preparing download. See notification for details',
    ToastAndroid.LONG,
  );
};
