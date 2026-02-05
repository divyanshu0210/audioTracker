import notifee, {AndroidImportance} from '@notifee/react-native';

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
