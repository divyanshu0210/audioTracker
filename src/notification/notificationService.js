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
