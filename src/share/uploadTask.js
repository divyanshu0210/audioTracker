// uploadTask.js
//
// The work of putting one device file on Drive, as the background transfer
// service runs it.
//
// Separate from shareDeviceFile so the imports stay a straight line: the
// service imports this, and shareDeviceFile imports the service to enqueue.
// Putting this in shareDeviceFile would make those two import each other.

import RNFS from 'react-native-fs';

import {saveDriveCopy} from '../database/sharedDriveCopies';
import {useMediaStore} from '../stores/useMediaStore';
import {isContentUri} from '../utils/mediaFile';
import {uploadFileToDrive} from './driveUpload';

/**
 * Runs `send` against a path RNFetchBlob can stream from.
 *
 * A file the user keeps outside the app has no such path — the row holds a
 * content:// uri, and wrap() wants a file on disk. So one is made for the
 * length of the upload and dropped afterwards, which is a scratch copy rather
 * than the permanent second copy every import used to carry.
 *
 * In the cache dir on purpose: if the process dies mid-upload and the finally
 * never runs, Android reclaims it on its own.
 */
const withStreamablePath = async (localPath, send) => {
  if (!isContentUri(localPath)) return send(localPath);

  const scratch = `${RNFS.CachesDirectoryPath}/upload_${Date.now()}`;
  await RNFS.copyFile(localPath, scratch);
  try {
    return await send(scratch);
  } finally {
    RNFS.unlink(scratch).catch(() => {});
  }
};

// Resolves to the Drive file id. Throws on failure — the caller owns what a
// failure means for the queue and the notification.
export const performUpload = async ({
  itemId,
  title,
  localPath,
  mimeType,
  onProgress,
  onTask,
}) => {
  const driveFileId = await withStreamablePath(localPath, path =>
    uploadFileToDrive({
      localPath: path,
      name: title,
      mimeType,
      onProgress,
      onTask,
    }),
  );

  // The copy stays private to the uploader. Nothing is granted here: who may
  // read it is decided later, per person — see grantReaderAccess, called when
  // a file is actually assigned to someone.
  await saveDriveCopy(itemId, driveFileId);

  // The list in memory was read before this row had a copy, and nothing refetches
  // on its own — without this the link chip and Copy Link would not appear until
  // the tab was reloaded.
  useMediaStore
    .getState()
    .setDeviceFiles(prev =>
      prev.map(f => (f.id === itemId ? {...f, drive_file_id: driveFileId} : f)),
    );

  return driveFileId;
};
