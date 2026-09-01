// uploadTask.js
//
// The work of putting one device file on Drive, as the background transfer
// service runs it.
//
// Separate from shareDeviceFile so the imports stay a straight line: the
// service imports this, and shareDeviceFile imports the service to enqueue.
// Putting this in shareDeviceFile would make those two import each other.

import {saveDriveCopy} from '../database/sharedDriveCopies';
import {useMediaStore} from '../stores/useMediaStore';
import {makeLinkReadable, uploadFileToDrive} from './driveUpload';

// Resolves to the Drive file id. Throws on failure — the caller owns what a
// failure means for the queue and the notification.
export const performUpload = async ({itemId, title, localPath, mimeType, onProgress}) => {
  const driveFileId = await uploadFileToDrive({
    localPath,
    name: title,
    mimeType,
    onProgress,
  });

  // Order matters: the id is recorded before the file is made link-readable.
  // If that second call fails, the copy still exists and is already ours, so a
  // retry finds it here rather than uploading the whole file again.
  await saveDriveCopy(itemId, driveFileId);

  // The list in memory was read before this row had a copy, and nothing refetches
  // on its own — without this the link chip and Copy Link would not appear until
  // the tab was reloaded.
  useMediaStore
    .getState()
    .setDeviceFiles(prev =>
      prev.map(f => (f.id === itemId ? {...f, drive_file_id: driveFileId} : f)),
    );

  await makeLinkReadable(driveFileId);

  return driveFileId;
};
