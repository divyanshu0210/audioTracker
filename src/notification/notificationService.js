import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Linking} from 'react-native';
import {getDriveCopyId} from '../database/sharedDriveCopies';
import {driveFileLink} from '../Linking/utils/shareLink';

const uploadChannelId = 'device-upload';
const uploadReadyChannelId = 'device-upload-ready';
let uploadNotificationReady;
let uploadReadyNotificationReady;

const getUploadNotificationId = itemId => `device-upload-${itemId}`;
const getUploadReadyNotificationId = itemId => `device-upload-ready-${itemId}`;

const ensureUploadChannel = () => {
  if (!uploadNotificationReady) {
    uploadNotificationReady = notifee
      .requestPermission()
      .then(() =>
        notifee.createChannel({
          id: uploadChannelId,
          name: 'Device file uploads',
          importance: AndroidImportance.LOW,
        }),
      );
  }
  return uploadNotificationReady;
};

const ensureUploadReadyChannel = () => {
  if (!uploadReadyNotificationReady) {
    uploadReadyNotificationReady = notifee
      .requestPermission()
      .then(() =>
        notifee.createChannel({
          id: uploadReadyChannelId,
          name: 'Completed uploads',
          importance: AndroidImportance.DEFAULT,
        }),
      );
  }
  return uploadReadyNotificationReady;
};

export async function onDisplayNotification(title, body) {
  try {
    await notifee.requestPermission();

    // Create a channel (required for Android)
    const channelId = await notifee.createChannel({
      id: 'default',
      name: 'Default Channel',
      importance: AndroidImportance.HIGH,
    });

    // Display a notification
    await notifee.displayNotification({
      title: title,
      body: body,
      android: {
        channelId,
        pressAction: {
          id: 'open-notifications', // Unique ID for the press action
          launchActivity: 'default', // Ensures the app opens
        },
      },
    });
  } catch (error) {
    console.error('Notification error:', error);
  }
}

// A notification that stays on screen and is rewritten in place, for work that
// takes a while. Passing the same id is what makes notifee replace the existing
// one instead of stacking a new one per update.
//
// Its own channel, at LOW importance: the default channel is HIGH, which would
// buzz the phone on every progress update. onlyAlertOnce covers the same ground
// for anyone whose channel settings differ, and ongoing stops it being swiped
// away while the work is still running.
export async function showProgressNotification({id, title, body, percent}) {
  try {
    await notifee.requestPermission();

    const channelId = await notifee.createChannel({
      id: 'progress',
      name: 'In progress',
      importance: AndroidImportance.LOW,
    });

    await notifee.displayNotification({
      id,
      title,
      body,
      android: {
        channelId,
        onlyAlertOnce: true,
        ongoing: true,
        progress:
          percent == null
            ? {indeterminate: true}
            : {max: 100, current: percent},
        pressAction: {id: 'default', launchActivity: 'default'},
      },
    });
  } catch (error) {
    console.error('Progress notification error:', error);
  }
}

// Ongoing notifications cannot be dismissed by the user, so whatever posted one
// has to take it down — including on the failure path.
export async function dismissNotification(id) {
  try {
    await notifee.cancelNotification(id);
  } catch (error) {
    console.error('Could not dismiss notification:', error);
  }
}

export async function showUploadReadyNotification({itemId, sourceId, title, driveFileId}) {
  try {
    // Completion must be a new notification. Reusing the ongoing progress ID
    // makes Android silently replace it, and the LOW progress channel suppresses
    // the alert even when the upload has just finished.
    await dismissNotification(getUploadNotificationId(itemId));
    const channelId = await ensureUploadReadyChannel();
    await notifee.displayNotification({
      id: getUploadReadyNotificationId(itemId),
      title: 'Share link ready',
      body: `${title || 'Device file'} is ready to share`,
      data: {
        kind: 'device-upload',
        itemId: String(itemId),
        sourceId: String(sourceId || ''),
        driveFileId: String(driveFileId || ''),
      },
      android: {
        channelId,
        onlyAlertOnce: true,
        ongoing: false,
        actions: [
          {title: 'Copy link', pressAction: {id: 'copy-device-link'}},
          {title: 'Share link', pressAction: {id: 'share-device-link'}},
        ],
        pressAction: {id: 'open-notifications', launchActivity: 'default'},
      },
    });
  } catch (error) {
    console.warn('Could not show upload-ready notification:', error?.message);
  }
}

export async function handleTransferNotificationAction({type, detail}) {
  if (type !== EventType.ACTION_PRESS) return false;
  const actionId = detail?.pressAction?.id;
  const data = detail?.notification?.data || {};
  if (
    (actionId === 'cancel-all-transfers' || actionId === 'cancel-transfers') &&
    (data.kind === 'transfer-service' || data.kind === 'share-transfer')
  ) {
    const {cancelAllTransfers} = await import('../backgroundService/backgroundDownloadService');
    await cancelAllTransfers();
    return true;
  }
  if (
    actionId === 'cancel-transfer-item' &&
    (data.kind === 'transfer-service' || data.kind === 'share-transfer') &&
    data.sourceId
  ) {
    const {cancelTransferItem} = await import('../backgroundService/backgroundDownloadService');
    await cancelTransferItem(data.sourceId);
    return true;
  }
  if (actionId === 'cancel-share-transfer' && data.kind === 'share-transfer') {
    const {cancelPriorityShareTransfer} = await import('../backgroundService/backgroundDownloadService');
    await cancelPriorityShareTransfer();
    return true;
  }
  if (data.kind !== 'device-upload' || !data.itemId) return false;

  const itemId = Number(data.itemId);
  const sourceId = data.sourceId || '';
  if (actionId !== 'copy-device-link' && actionId !== 'share-device-link') {
    return false;
  }
  let driveId = data.driveFileId;
  if (!driveId) {
    try {
      driveId = await getDriveCopyId(itemId);
    } catch (error) {
      console.warn('Could not resolve uploaded Drive link:', error?.message);
      return false;
    }
  }
  if (!driveId) return false;
  const link = driveFileLink(driveId);
  if (actionId === 'copy-device-link') {
    Clipboard.setString(link);
    await onDisplayNotification('Link copied', 'The Drive link is on your clipboard.');
  } else {
    await Linking.openURL(
      `audiotracker://share-device-link?url=${encodeURIComponent(link)}`,
    );
  }
  return true;
}
