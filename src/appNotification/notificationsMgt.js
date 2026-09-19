import AsyncStorage from '@react-native-async-storage/async-storage';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {onDisplayNotification} from '../notification/notificationService';
import {BASE_URL, fetchNewConnections} from '../appMentorBackend/userMgt';
import {AppState} from 'react-native';
import useNotificationStore from './useNotificationStore';
import {runNativeMenteeSyncNow} from '../appMentor/menteeNotesSync';

export const handleWSNotifications = async data => {
  await fetchNotification();
  await updateNotificationCount();
};

export const handleBackgroundNotifications = async () => {
  if (AppState.currentState !== 'active') {
    fetchNotification();
  }
};

// Facts the app should act on, with nothing to show for them. Kept out of the
// notification pipeline entirely: putting "the folder is shared" in someone's
// tray would be showing them plumbing.
const SILENT_TYPES = new Set([
  'mentorship_changed',
  'notes_shared',
  'notes_updated',
]);

/**
 * What a silent push is for.
 *
 * This is the path that makes the whole thing work on a phone nobody opens: a
 * data-only message starts the process and runs this headless, and the worker
 * it hands to does both halves — a mentee's device granting its new mentor
 * access to its backup folder, and a mentor's device pulling its mentees'
 * notes.
 */
/**
 * Whether this mentee is the one on screen right now.
 *
 * Both halves matter. The app being open is not enough — a push about one
 * mentee while their mentor reads another's report is work nobody asked for
 * — and the selection alone is not enough either, since a backgrounded app
 * has no screen to update and the fetch would only be spending a stranger's
 * battery. Selecting a mentee fetches them, so nothing is lost by waiting.
 */
const isBeingWatched = menteeId => {
  if (AppState.currentState !== 'active') return false;
  if (!menteeId) return false;
  const active = useMentorMenteeStore.getState().activeMentee?.id;
  return active != null && String(active) === String(menteeId);
};

const handleSilentPush = async remoteMessage => {
  const data = remoteMessage?.data ?? {};

  // 'notes_updated' is a mentee saying they have just written something. That
  // is worth fetching only if their mentor is looking: a mentor with a
  // hundred mentees would otherwise spend the day downloading notes nobody
  // has opened. Picking that mentee fetches them; until then nothing is owed.
  //
  // The other two are not like that, and neither is gated:
  //
  //   notes_shared      once per mentorship, and the first moment the notes
  //                     can be read at all. Doing it now is what spares the
  //                     mentor a whole backup download the first time they
  //                     look.
  //   mentorship_changed  on the mentee's device this is what triggers the
  //                     grant, and a mentee who never opens the app is
  //                     exactly the case that depends on it.
  if (data.type === 'notes_updated' && !isBeingWatched(data.menteeId)) return;

  // Handed to WorkManager rather than done here. This handler is given
  // seconds and may be running headless on a phone that was killed; the
  // worker waits for a network, retries, and outlives this process.
  //
  // The id names one mentee, so the worker opens one folder rather than
  // every folder it has access to. Absent — as on the mentee's own
  // mentorship_changed — it reconciles sharing and fetches nobody.
  runNativeMenteeSyncNow(data.menteeId ?? null);
};

export const handleFCMNotifications = async remoteMessage => {
  if (
    SILENT_TYPES.has(remoteMessage?.data?.type) &&
    !remoteMessage?.notification
  ) {
    await handleSilentPush(remoteMessage);
    return;
  }

  // await updateNotificationCountByOne();
  await fetchNotification();
  await updateNotificationCount();
  await displayFCMNotifications(remoteMessage);
};

export const fetchNotification = async () => {
  const data = await fetchPendingNotifications();
  await handleAssignmentNotifications(data);
};

// No AppState guard.
//
// This runs from the background FCM handler too, and refusing to act there was
// what left a new mentorship invisible: the approval arrives while the app is
// in the background, the pipeline fetches the notification, sees the
// 'approved' entry - and then did nothing with it. HomeScreen's mount effect
// could not recover it either, because the screen never unmounted, so the list
// stayed stale until the process was killed.
//
// Backgrounded-but-alive runs in the same JS context, so these store writes
// land on the live store and the drawer is right the moment the user returns.
// If the process was killed the headless context is thrown away instead, which
// costs nothing: relaunching mounts HomeScreen, which fetches both of these
// anyway.
const handleAssignmentNotifications = async notifications => {
  const notifArray = Array.isArray(notifications)
    ? notifications
    : [notifications];

  // Only 'approved' is acted on here. An 'assignment' notification used to
  // raise a flag for a button that no longer exists - the assignments it
  // announces are picked up by the startup sync, which counts them itself.
  const hasNewConnections = notifArray.some(n => n?.type === 'approved');
  if (hasNewConnections) {
    await fetchNewConnections();
  }
};

const displayNotifications = async data => {
  if (!data) {
    console.warn('No data provided to displayNotifications');
    return;
  }

  const notifications = Array.isArray(data) ? data : [data];

  if (!notifications.length > 0) return;

  for (const notification of notifications) {
    try {
      const message = formatNotification(notification);
      const title = getTitleByType(notification?.type);
      await onDisplayNotification(title, message);
    } catch (error) {
      console.error('Error processing notification:', error, notification);
    }
  }
};

// Takes the whole remote message rather than just its `notification` block.
// A data-only push has no `notification` block at all, and reading title/body
// off `undefined` used to post an empty notifee notification — which most
// Android ROMs render as nothing, so the push looked like it never arrived.
const displayFCMNotifications = async remoteMessage => {
  try {
    const {notification, data} = remoteMessage ?? {};
    const title = notification?.title || data?.title;
    const message = notification?.body || data?.body;

    if (!title && !message) {
      console.warn('FCM message had no title or body to display:', remoteMessage);
      return;
    }

    await onDisplayNotification(title, message);
  } catch (error) {
    console.error('Error processing notification:', error, remoteMessage);
  }
};

export const fetchPendingNotifications = async () => {
  const userId = await AsyncStorage.getItem('userId');

  try {
    const response = await fetch(
      `${BASE_URL}/notifications/pending/?receiver_id=${userId}`,
    );
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Pending notifications:', data);
      return data;
      // return data.length;
    } else {
      console.warn(
        '❌ Failed to fetch notifications:',
        data?.error || 'Unknown error.',
      );
    }
  } catch (error) {
    console.error(
      '❌ Fetch error while getting notifications:',
      error.message || 'Network or parsing error.',
    );
  }
};

export const fetchSentNotifications = async () => {
  const userId = await AsyncStorage.getItem('userId');

  try {
    const response = await fetch(
      `${BASE_URL}/notifications/sent/?receiver_id=${userId}`,
    );
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Sent notifications:', data);
      return data;
    } else {
      console.warn(
        '❌ Failed to fetch notifications:',
        data?.error || 'Unknown error.',
      );
    }
  } catch (error) {
    console.error(
      '❌ Fetch error while getting notifications:',
      error.message || 'Network or parsing error.',
    );
  }
};

export const fetchSentNotificationsCount = async () => {
  const userId = await AsyncStorage.getItem('userId');

  try {
    const response = await fetch(
      `${BASE_URL}/notifications/get-sent-count/?receiver_id=${userId}`,
    );
    const data = await response.json();

    if (response.ok) {
      return data.sent_notifications_count;
    } else {
      console.warn(
        '❌ Failed to fetch notifications:',
        data?.error || 'Unknown error.',
      );
    }
    return 0;
  } catch (error) {
    console.error(
      '❌ Fetch error while getting notifications:',
      error.message || 'Network or parsing error.',
    );
  }
};

export const updateNotificationCount = async () => {
  const {setNotificationsCount} = useNotificationStore.getState();
  const count = await fetchSentNotificationsCount();
  setNotificationsCount(count);
};

export const markNotificationsAsViewed = async () => {
  try {
    const userId = await AsyncStorage.getItem('userId');
    const response = await fetch(`${BASE_URL}/notifications/mark-as-viewed/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({receiver_id: userId}),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to mark notifications as viewed:', errorData);
      return null;
    }

    const result = await response.json();
    console.log('Notifications marked as viewed:', result);
    return result;
  } catch (error) {
    console.error('Error marking notifications as viewed:', error);
    return null;
  }
};

export const formatNotification = notification => {
  const senderName = notification?.sender_name || 'Someone';
  const type = notification?.type;

  switch (type) {
    case 'mentor':
      return `${senderName} has created a new MentorMentee request.`;
    case 'mentee':
      return `${senderName} has created a new MentorMentee request.`;
    case 'assignment':
      return `You have received new assignments from ${senderName}.`;
    case 'report':
      return `${senderName} has submitted a report for your review.`;
    case 'approved':
      return `${senderName} has approved your request.`;
    case 'rejected':
      return `${senderName} has rejected your request.`;
    case 'cancelled':
      return `${senderName} has cancelled their request.`;
    default:
      return `You have a new notification from ${senderName}.`;
  }
};

const getTitleByType = type => {
  switch (type) {
    case 'mentor':
    case 'mentee':
      return 'Mentor Mentee Request';
    case 'assignment':
      return 'New Assignment';
    case 'report':
      return 'Report Submitted';
    case 'approved':
    case 'rejected':
    case 'cancelled':
      return 'Mentorship Status';
    default:
      return 'Notification';
  }
};
