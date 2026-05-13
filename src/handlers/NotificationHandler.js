import { useNavigation } from "@react-navigation/core";
import notifee, {AndroidImportance, EventType} from '@notifee/react-native';
import { useEffect } from "react";

export function NotificationHandler() {
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({type, detail}) => {
      if (
        type === EventType.PRESS &&
        detail.pressAction?.id === 'open-notifications'
      ) {
        navigation.navigate('Notifications');
      }
    });

    return unsubscribe;
  }, [navigation]);

  return null;
}