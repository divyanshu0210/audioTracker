// notificationPermission.js
//
// What "allowed" means for a notification, and nothing else.
//
// This module used to own the asking too: askForNotificationsOnce, which
// spent Android's two dialogs one site at a time and wrote down which site
// had used which. PermissionGate owns that now — it asks for notifications
// and media together, on a screen that says what each is for, and falls
// through to system settings once the dialogs run out. Keeping a second
// asker here would only have given the budget two owners.

import {AuthorizationStatus} from '@notifee/react-native';

// PROVISIONAL is iOS-only quiet delivery — those notifications do arrive, just
// without sound, so it counts as allowed. On Android the status is only ever
// DENIED or AUTHORIZED.
export const isAllowed = settings =>
  settings?.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
  settings?.authorizationStatus === AuthorizationStatus.PROVISIONAL;
