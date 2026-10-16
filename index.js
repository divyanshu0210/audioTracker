import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';
import "./src/appNotification/appFCMNotification/firebase-messaging.js"; 
import notifee from '@notifee/react-native';
import {handleTransferNotificationAction} from './src/notification/notificationService';
import {registerTransferForegroundService} from './src/backgroundService/backgroundDownloadService';

notifee.onBackgroundEvent(handleTransferNotificationAction);
registerTransferForegroundService();

AppRegistry.registerComponent(appName, () => App);
