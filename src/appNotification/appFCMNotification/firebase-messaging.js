import messaging from '@react-native-firebase/messaging';
import { handleFCMNotifications } from '../notificationsMgt';

// Background/quit notifications handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  handleFCMNotifications(remoteMessage.notification);
  console.log('📩 Notification handled in background:', remoteMessage);
});
