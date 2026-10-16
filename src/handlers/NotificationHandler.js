import { useNavigation } from "@react-navigation/core";
import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import { useEffect } from "react";
import { navigationRef } from "./navigationRef";
import {handleTransferNotificationAction} from '../notification/notificationService';

export function NotificationHandler() {

  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
      handleTransferNotificationAction({type, detail});
      if (
        type === EventType.PRESS &&
        detail.pressAction?.id === 'open-notifications'
      ) {
        navigationRef.navigate('Notifications');
      }
    });

    return unsubscribe;
  }, []);

  return null;
}
