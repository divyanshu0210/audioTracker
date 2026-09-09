import messaging from '@react-native-firebase/messaging';
import {Platform} from 'react-native';
import {BASE_URL} from '../../appMentorBackend/userMgt';
import {handleFCMNotifications} from '../notificationsMgt';
import {askForNotificationsOnce} from '../notificationPermission';

export async function setupFCM(user) {
  const userId = user?.id;

  // Permission and token are two different things, and tying them together is
  // what broke this. A device gets an FCM token whether or not the user allowed
  // notifications — on Android POST_NOTIFICATIONS only governs whether the
  // system may *display* what arrives, and the token exists regardless. Gating
  // registration on the permission meant one dismissed dialog left the backend
  // with no token for this device at all, and since Android stops re-showing
  // that dialog after two dismissals, it never recovered on later launches:
  // every push was dropped server-side with nothing visible on either end.
  //
  // So register first, then ask. A user who declines still has a live token, so
  // the moment they turn notifications on in system settings, pushes work with
  // no re-login and no reinstall.
  await registerFcmToken(userId);

  // Once, not on every launch. setupFCM runs on each start via restoreSession,
  // and the old unconditional request burned both of Android's two dialogs
  // inside the first two app opens — before the user had played anything or
  // met the mentorship feature, and with nothing on screen explaining why.
  // Asking here keeps the first chance; the second is spent at first
  // background playback, where the reason is visible.
  await askForNotificationsOnce('login');

  // Tokens rotate — app restore to a new device, cleared app data, Firebase
  // rotating one on its own. Without this the backend keeps pushing to a dead
  // token forever, and FCM reports that as a success to the sender.
  const unsubscribeTokenRefresh = messaging().onTokenRefresh(token => {
    registerFcmToken(userId, token);
  });

  // Foreground notifications
  const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
    await handleFCMNotifications(remoteMessage);
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

  return () => {
    unsubscribeTokenRefresh();
    unsubscribeOnMessage();
  };
}


// Get the device FCM token and hand it to the backend. Pass `refreshedToken`
// from onTokenRefresh; otherwise it is fetched here.
export async function registerFcmToken(userId, refreshedToken) {
  if (!userId) {
    console.warn('⚠️ No userId — skipping FCM token registration');
    return null;
  }

  try {
    // iOS hands out no token until the device is registered with APNs. RNFirebase
    // does this automatically, but not before the first getToken() on a cold
    // install, which is exactly when registration runs. Android has no equivalent.
    if (
      Platform.OS === 'ios' &&
      !messaging().isDeviceRegisteredForRemoteMessages
    ) {
      await messaging().registerDeviceForRemoteMessages();
    }

    const fcmToken = refreshedToken ?? (await messaging().getToken());
    if (!fcmToken) {
      console.warn('⚠️ FCM returned no token');
      return null;
    }

    console.log('✅ Your FCM Token:', fcmToken);

    const response = await fetch(`${BASE_URL}/fcm/register_device_token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: fcmToken,
        user_id: userId, // or email: "user@gmail.com"
      }),
    });

    // The other half of the silent failure: an unchecked fetch makes a 404 or a
    // 500 from the backend look exactly like a successful registration.
    if (!response.ok) {
      const body = await response.text();
      console.error(
        `❌ Token registration failed (${response.status}):`,
        body || '(empty response)',
      );
      return null;
    }

    console.log('✅ FCM token registered for user', userId);
    return fcmToken;
  } catch (error) {
    console.log('❌ Error registering FCM token', error);
    return null;
  }
}
