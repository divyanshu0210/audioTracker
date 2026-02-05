import messaging from '@react-native-firebase/messaging';
import {Alert, Platform} from 'react-native';
import {BASE_URL} from '../../appMentorBackend/userMgt';
import { fetchNotification, handleFCMNotifications } from '../notificationsMgt';

export async function setupFCM(user) {
  const userId = user.id;
  const hasPermission = await requestUserPermission();
  if (hasPermission) {
    // Replace with your actual user auth token (JWT/session)
    await getFcmToken(userId);
  }

  // Foreground notifications
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    await handleFCMNotifications(remoteMessage.notification);
  });

  // When app opened from background state
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('📩 Notification caused app to open:', remoteMessage);
  });

  // When app opened from quit state
  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) {
        console.log('📩 Notification opened app from quit:', remoteMessage);
      }
    });

  return unsubscribe;
}

// Request user permission (iOS: alert, sound, badge; Android: auto-granted)
export async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  return enabled;
}

// Get device FCM token
export async function getFcmToken(userId) {
  try {
    const fcmToken = await messaging().getToken();
    if (fcmToken) {
      console.log('✅ Your FCM Token:', fcmToken);

      // Register device token with backend
      await fetch(`${BASE_URL}/fcm/register_device_token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: fcmToken,
          user_id: userId, // or email: "user@gmail.com"
        }),
      });
    }
  } catch (error) {
    console.log('❌ Error getting FCM token', error);
  }
}
