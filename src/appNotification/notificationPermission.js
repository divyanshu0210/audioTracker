import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AuthorizationStatus} from '@notifee/react-native';
import {AppState} from 'react-native';

// PROVISIONAL is iOS-only quiet delivery — those notifications do arrive, just
// without sound, so it counts as allowed. On Android the status is only ever
// DENIED or AUTHORIZED.
export const isAllowed = settings =>
  settings?.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
  settings?.authorizationStatus === AuthorizationStatus.PROVISIONAL;

export async function hasNotificationPermission() {
  try {
    return isAllowed(await notifee.getNotificationSettings());
  } catch (error) {
    console.error('Could not read notification settings:', error);
    return false;
  }
}

const ASK_PREFIX = 'notifAsk:';

/**
 * Show the system permission dialog at most once per `site`, ever.
 *
 * Android hands out exactly two dialogs for POST_NOTIFICATIONS and then stops:
 * every later requestPermission() returns DENIED instantly, displaying nothing.
 * One site asks: 'login', on first launch alongside the rest of first-run
 * setup. The second chance is deliberately left unspent rather than fired
 * somewhere the user has no idea what it is for.
 *
 * Anyone who declines is not asked again. The banner on the Notifications
 * screen is the route after that, and it falls through to system settings,
 * which keeps working once the dialogs no longer do.
 *
 * @param {string} site - currently only 'login'
 * @returns {Promise<boolean>} whether notifications are allowed now.
 */
export async function askForNotificationsOnce(site) {
  try {
    if (isAllowed(await notifee.getNotificationSettings())) {
      console.log(`⏭️ Not asking at '${site}' — notifications are already allowed`);
      return true;
    }

    // A permission dialog needs a foregrounded activity to host it. Asking
    // from the background shows the user nothing — but the attempt would still
    // mark the site as spent below, quietly throwing away one of the two
    // chances. This matters for the playback site in particular: reconcile can
    // fire while the app sits in the background or in PiP. Skipping without
    // recording anything means the next play from the foreground still gets to
    // ask.
    if (AppState.currentState !== 'active') {
      console.log(`⏭️ Not asking for notifications at '${site}' — app is not in the foreground`);
      return false;
    }

    const key = `${ASK_PREFIX}${site}`;
    if (await AsyncStorage.getItem(key)) {
      console.log(`⏭️ Not asking at '${site}' — this site has already had its one dialog`);
      return false;
    }

    // Recorded before the dialog, not after: if the app dies while it is up,
    // the chance is spent regardless, and re-asking on next launch would just
    // burn the other site's turn too.
    await AsyncStorage.setItem(key, '1');

    const settings = await notifee.requestPermission();
    const allowed = isAllowed(settings);

    console.log(
      allowed
        ? `✅ Notifications allowed (asked at: ${site})`
        : `⚠️ Notifications declined (asked at: ${site}) — pushes will arrive but stay hidden`,
    );

    return allowed;
  } catch (error) {
    console.error('Notification permission request failed:', error);
    return false;
  }
}
