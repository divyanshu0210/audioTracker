import AsyncStorage from '@react-native-async-storage/async-storage';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {onDisplayNotification} from '../notification/notificationService';
import {BASE_URL, fetchNewConnections} from '../appMentorBackend/userMgt';
import {AppState} from 'react-native';
import useNotificationStore from './useNotificationStore';

export const handleWSNotifications = async data => {
  await fetchNotification();
  await updateNotificationCount();
};

export const handleBackgroundNotifications = async () => {
  if (AppState.currentState !== 'active') {
    fetchNotification();
  }
};

export const handleFCMNotifications = async notification => {
  // await updateNotificationCountByOne();
  await fetchNotification();
  await updateNotificationCount();
  await displayFCMNotifications(notification);
};

export const fetchNotification = async () => {
  const data = await fetchPendingNotifications();
  await handleAssignmentNotifications(data);
};

const handleAssignmentNotifications = async notifications => {
  if (AppState.currentState === 'active') {
    const {setNewAssignmentsFlag} = useNotificationStore.getState();
    const notifArray = Array.isArray(notifications)
      ? notifications
      : [notifications];

    const hasAssignment = notifArray.some(n => n?.type === 'assignment');
    if (hasAssignment) {
      setNewAssignmentsFlag(true);
    }
    const hasNewConnections = notifArray.some(n => n?.type === 'approved');
    if (hasNewConnections) {
      await fetchNewConnections();
    }
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

const displayFCMNotifications = async notification => {
  try {
    const message = notification?.body;
    const title = notification?.title;
    await onDisplayNotification(title, message);
  } catch (error) {
    console.error('Error processing notification:', error, notification);
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
