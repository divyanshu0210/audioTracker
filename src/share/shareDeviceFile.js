// shareDeviceFile.js
//
// Turning a device file into something shareable.
//
// Every other item type already has an id at its own source, so getShareLink
// just rebuilds a url from it. A device file came off the phone and exists
// nowhere else, so there is nothing to rebuild — a copy has to be put
// somewhere reachable first. That is what this does: upload to the user's own
// Drive, make the copy readable by link, and remember which Drive file it is
// so the link can be rebuilt afterwards and the upload never repeats.
//
// The upload runs unawaited from the caller's point of view — a media file can
// take a while and the user should not be held in a menu for it — and reports
// through a notification the way downloads do.

import {Alert, ToastAndroid} from 'react-native';
import RNFS from 'react-native-fs';
import useShareStore from '../stores/useShareStore';
import {useMediaStore} from '../stores/useMediaStore';
import {softDeleteItem} from '../database/D';
import {deleteDriveCopy, getDriveCopyId} from '../database/sharedDriveCopies';
import {
  enqueueDownload,
  enqueueUpload,
} from '../backgroundService/backgroundDownloadService';
import {resolveDestPath} from '../Linking/utils/handleLinkSubmit';
import {trashDriveFile} from './driveUpload';

// Said in full before anything is uploaded. Sharing a private file off the
// phone to a link anyone can open is not something to infer from a tap on
// "Copy Link", so it is its own menu entry with its own confirmation.
const CONFIRM_TITLE = 'Share this file?';
const CONFIRM_BODY =
  'A copy will be uploaded to your Google Drive, in a folder called ' +
  '"audioTracker Shared", and given a link that anyone who has it can open.\n\n' +
  'You can delete the copy from your Drive at any time, which stops the link working.';

export const confirmAndShareDeviceFile = item =>
  new Promise(resolve => {
    Alert.alert(CONFIRM_TITLE, CONFIRM_BODY, [
      {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
      {
        text: 'Upload and share',
        onPress: () => {
          shareDeviceFile(item);
          resolve(true);
        },
      },
    ]);
  });

// Hands the file to the background transfer service rather than uploading it
// here. A menu handler's promise dies with the screen and, worse, a plain
// async upload is suspended when the app is backgrounded — the upload would
// stall part-done with its notification frozen. The service is a foreground
// service, so it survives both, and its queue is persisted so a job that was
// running when the app was killed is picked up again on next launch.
export const shareDeviceFile = async item => {
  if (item?.id == null) {
    Alert.alert('Cannot share', 'This file has no database entry yet.');
    return false;
  }
  if (useShareStore.getState().isUploading(item.id)) {
    ToastAndroid.show('Already uploading this file', ToastAndroid.SHORT);
    return false;
  }
  // The row can outlive the file; queueing a path that is not there would fail
  // deep inside the request with a much worse message.
  if (!item.file_path || !(await RNFS.exists(item.file_path))) {
    Alert.alert('Cannot share', 'This file is no longer on the device.');
    return false;
  }

  await enqueueUpload({
    id: item.id,
    sourceId: item.source_id,
    title: item.title,
    localPath: item.file_path,
    mimeType: item.mimeType,
  });

  ToastAndroid.show(
    'Uploading — see notification for progress',
    ToastAndroid.SHORT,
  );
  return true;
};

// Undoes a share, for when the file it belongs to is being deleted.
//
// The copy is readable by anyone holding the link, so leaving it behind would
// mean a file the user believes they deleted stays openable by whoever they
// sent it to. Deleting locally has to take the shared copy with it.
//
// Never throws: this runs inside a delete the user already confirmed, and
// failing to reach Drive (offline, token expired) must not leave the file
// half-deleted. The local mapping is dropped either way, so the app stops
// offering a link it can no longer vouch for; the worst case is an orphaned
// file in the user's own Drive, which they can see and remove in the
// "audioTracker Shared" folder.
// Takes the id rather than the item: bulk delete works from selection
// entries, which carry no joined columns, so the copy is looked up here.
export const removeSharedCopy = async itemId => {
  if (itemId == null) return;

  let driveFileId = null;
  try {
    driveFileId = await getDriveCopyId(itemId);
  } catch (error) {
    console.error('Could not read the shared copy to remove:', error);
    return;
  }
  if (!driveFileId) return;

  try {
    await trashDriveFile(driveFileId);
  } catch (error) {
    console.error('Could not trash the shared Drive copy:', error);
  }

  try {
    await deleteDriveCopy(itemId);
  } catch (error) {
    console.error('Could not clear the shared copy mapping:', error);
  }

  // The row it was joined onto is still in memory carrying the old id.
  useMediaStore
    .getState()
    .setDeviceFiles(prev =>
      prev.map(f => (f.id === itemId ? {...f, drive_file_id: null} : f)),
    );
};

// Pulls a shared Drive copy back down onto the device, for a file whose row
// survived a restore but whose bytes did not.
//
// Goes through the same background transfer queue as everything else, with
// googleAuth set — the copy lives in the user's own private Drive area and an
// anonymous request would 403 even though the file is link-readable.
//
// On success the download service writes localPath into items.file_path, which
// is what puts the file back in validDeviceFiles and makes it playable again.
export const downloadSharedCopy = async item => {
  const driveFileId = item?.drive_file_id;
  if (!driveFileId) {
    Alert.alert(
      'Nothing to download',
      'This file has no copy in your Drive to restore from.',
    );
    return false;
  }

  // Rebuilt rather than reusing the restored file_path: that path came from
  // whichever device made the backup and may not be writable here. Built by
  // the same function an import uses, so the name is sanitised — a title
  // carrying '#' or '%' would otherwise produce a path RNFS mis-parses — and
  // a collision with an unrelated file of the same name gets its own path
  // rather than silently pointing at the other one.
  const localPath = await resolveDestPath(item.title, item.source_id);

  await enqueueDownload({
    id: item.id,
    sourceId: item.source_id,
    title: item.title,
    url: `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    localPath,
    type: 'device_file',
    mimeType: item.mimeType,
    googleAuth: true,
  });

  ToastAndroid.show(
    'Downloading — see notification for progress',
    ToastAndroid.LONG,
  );
  return true;
};

// Takes the row out of the list without destroying anything: a soft delete,
// so the db row and everything hanging off it — notes, category membership —
// stays exactly where it is and can be found again.
//
// Deliberately does not touch a shared Drive copy, unlike deleting a file that
// is actually present. For a file whose bytes are already gone, that copy is
// the only one left, and destroying it from a tidy-up action would be a poor
// surprise. The consequence is that a link handed out earlier keeps working
// for a row the user has hidden.
const removeMissingFromList = async item => {
  try {
    await softDeleteItem(item.type, item.source_id);
    useMediaStore
      .getState()
      .setDeviceFiles(prev =>
        prev.filter(f => f.source_id !== item.source_id),
      );
    ToastAndroid.show('Removed from list', ToastAndroid.SHORT);
  } catch (error) {
    console.error('Could not remove the missing file from the list:', error);
    Alert.alert('Could not remove', 'Something went wrong hiding this file.');
  }
};

// Shown when a missing file is tapped, and from its menu. What it offers
// depends on whether there is a copy on Drive to fetch back.
export const offerSharedCopyDownload = item => {
  const hasCopy = !!item?.drive_file_id;

  Alert.alert(
    'File not on this device',
    hasCopy
      ? 'This file is not stored on this device any more, but a copy is in your Google Drive. Download it to play it again.'
      : 'This file is not stored on this device any more.',
    [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove from list',
        style: 'destructive',
        onPress: () => removeMissingFromList(item),
      },
      ...(hasCopy
        ? [{text: 'Download', onPress: () => downloadSharedCopy(item)}]
        : []),
    ],
  );
};
