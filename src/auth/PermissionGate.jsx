// PermissionGate.jsx
//
// The two permissions this app cannot do its job without, asked for once, in
// one place, in words that say what they are for.
//
// Both used to be asked for wherever they happened to be needed — notifications
// during FCM setup, media access halfway through an import — which meant a
// system dialog appearing over a screen that explained nothing, and a refusal
// costing the user a feature they had not met yet. Android hands out exactly
// two dialogs per permission and then answers every later request with an
// instant denial, so those scattered asks were also spending a budget nobody
// was counting.
//
// A screen between login and MainApp, not an overlay on top of it. As an
// overlay it lost a race it could not win: a Modal is its own window, so
// whatever is behind it gets painted first, and the tabs and the continue-
// watching sheet appeared for a moment before the gate covered them. Deciding
// before MainApp is navigated to means none of it is ever built.
//
// Which also keeps the old promise: only someone who has signed in sees this,
// because login is what sends them here. Asking earlier would be asking on
// behalf of an app the user has not yet agreed to use.
//
// It does not offer a way past itself. That is the whole point of a gate, and
// it is only defensible because of the settings fallback below: once Android
// stops showing its dialogs, the button changes to open system settings, which
// keeps working forever. Without that, a user who tapped Deny twice would own
// an app that shows them nothing but this screen.

import notifee from '@notifee/react-native';
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {isAllowed} from '../appNotification/notificationPermission';
import {
  ensureMediaReadPermission,
  hasMediaReadPermission,
} from '../utils/mediaFile';

const readNotifications = async () => {
  try {
    return isAllowed(await notifee.getNotificationSettings());
  } catch (error) {
    console.error('Could not read notification settings:', error);
    return false;
  }
};

// Android only. There is no MediaStore anywhere else, and a gate that can
// never be satisfied is worse than no gate at all.
const readMedia = async () =>
  Platform.OS === 'android' ? hasMediaReadPermission() : true;

/**
 * Where to go once the Settings button appears, for media.
 *
 * Notifications needs nothing like this — notifee opens the notification page
 * for this app directly, and the switch is right there. Linking.openSettings
 * has no such aim: it lands on the app's own page in system settings, which
 * lists battery, storage, data and a dozen other things, and the switch that
 * matters is two taps further in. Someone who has just been told to go to
 * settings and is then shown that page will reasonably conclude the app is
 * wrong.
 *
 * The wording is Android's own, and it changed in 13: the single "Files and
 * media" switch became one entry per media type. Naming what is actually on
 * their screen matters more here than a form of words that covers every
 * version.
 */
const mediaSettingsSteps = () => {
  if (Platform.OS !== 'android') return null;

  // Two switches on 13 and later, and both are needed — the library holds
  // audio and video alike, and half a grant is a library where half the files
  // open. "Allow all" is named on the second because the photos-and-videos
  // dialog offers limited access too, and a hand-picked selection is not
  // access to files this app was given years ago.
  return Platform.Version >= 33
    ? [
        'Settings → App Permissions',
        '  • Music and audio → Allow',
        '  • Photos and videos → Allow all',
      ]
    : ['Permissions → Files and media → Allow'];
};

/**
 * And for notifications.
 *
 * Shorter, because notifee's deep link lands on this app's notification page
 * rather than the app page — there is no walking to do, only a switch to
 * find, and Android puts a master toggle at the top of it. Worth saying all
 * the same: someone who has just been sent to a settings screen should be
 * told what they are looking for on it.
 */
const notificationSettingsSteps = () =>
  Platform.OS === 'android'
    ? ['  • Notifications → Show notifications → On']
    : null;

// A dialog the user actually saw cannot come back this fast — it waits for a
// tap. A request that returns quicker than this and still says no is Android
// answering on the user's behalf with nothing on screen, because it has
// stopped offering that permission's dialog: two refusals and it is done,
// counted across installs and invisible to us until we ask.
const INSTANT_MS = 400;

const PermissionGate = ({navigation}) => {

  // null while the first check is in flight. Rendering the gate on an
  // assumption would flash it in front of everyone who granted these months
  // ago, on every single launch.
  const [granted, setGranted] = useState(null);

  // Which of the two has already had a dialog fail to change anything. Android
  // gives no way to ask whether a dialog will still be shown, so this is
  // inferred the only way available: ask, and see whether the answer moved.
  const [exhausted, setExhausted] = useState({
    notifications: false,
    media: false,
  });

  const [busy, setBusy] = useState(null);

  const check = useCallback(async () => {
    const [notifications, media] = await Promise.all([
      readNotifications(),
      readMedia(),
    ]);
    setGranted({notifications, media});
  }, []);

  useEffect(() => {
    check();

    // Granting through system settings happens outside this app, so the return
    // trip is what dismisses the gate — nothing on this screen will hear about
    // it otherwise.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [check]);

  // Notifications has a page of its own to land on. Media has none, which is
  // what the steps at the foot of this screen are for.
  const openSettings = useCallback(async key => {
    if (key === 'notifications') {
      await notifee.openNotificationSettings();
    } else {
      await Linking.openSettings();
    }
  }, []);

  const request = useCallback(
    async key => {
      setBusy(key);
      try {
        if (exhausted[key]) {
          // The dialogs are spent. Settings is the only door left, and it is
          // still a door.
          await openSettings(key);
          return;
        }

        const startedAt = Date.now();
        const allowed =
          key === 'notifications'
            ? isAllowed(await notifee.requestPermission())
            : await ensureMediaReadPermission();
        const shown = Date.now() - startedAt >= INSTANT_MS;

        setGranted(prev => ({...(prev || {}), [key]: allowed}));
        if (allowed) return;

        // Declined, so the next tap belongs in settings either way.
        setExhausted(prev => ({...prev, [key]: true}));

        // And when nothing was ever on screen, this tap goes there too.
        // Android had already stopped offering this permission's dialog — in
        // an earlier session, or before a reinstall — so the button that only
        // renamed itself to Settings spent a tap on nothing and asked for
        // another. Which permission that happens to is not predictable: each
        // has its own budget, so denying one can leave the other still
        // saying Allow over a dialog that will never appear again.
        if (!shown) await openSettings(key);
      } catch (error) {
        console.error(`Could not request ${key} permission:`, error);
      } finally {
        setBusy(null);
      }
    },
    [exhausted, openSettings],
  );

  const checked = granted !== null;
  const satisfied = checked && granted.notifications && granted.media;

  // Both granted — which can happen on arrival, if they were turned on from
  // system settings while this screen waited, or the moment the second
  // dialog is accepted.
  //
  // Back to login rather than onwards into the app: login is what decides
  // what happens next, and after this screen there is still a backup check
  // and possibly a restore to run before anybody sees a library. It picks
  // the session up again, finds these permissions granted, and carries on
  // past the point it stopped at.
  useEffect(() => {
    if (satisfied) navigation.replace('GoogleLoginScreen');
  }, [satisfied, navigation]);

  // Back cannot leave. This is a stack screen now rather than a modal, so
  // the hardware button would otherwise pop it and put the login screen
  // back — an exit the gate is not supposed to have. The home button still
  // works for anyone who would rather not.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, []);

  // Whichever of the two has run out of dialogs gets its path printed, in
  // the order the rows are listed above.
  const settingsPaths = [
    {key: 'media', lines: mediaSettingsSteps()},
    {key: 'notifications', lines: notificationSettingsSteps()},
  ];

  const rows = [
    {
      key: 'media',
      icon: 'musical-notes-outline',
      title: 'Your audio and video',
      // Said in terms of what the user loses, not of the Android permission
      // name, which tells them nothing about this app.
      body: 'Lets you play audio and video files on your device.',
    },
    {
      key: 'notifications',
      icon: 'notifications-outline',
      title: 'Notifications',
      body: 'So you can keep listening with your screen off and to stay connected with your mentor.',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Blank while the first read is in flight, and blank again once both
          are granted — the navigation away is already in flight by then, and
          a screen that flashes its own content on the way out is the thing
          this was moved here to stop. */}
      {checked && !satisfied && (
        <>
          <Text style={styles.heading}>Let’s get AudioTracker ready</Text>
          <Text style={styles.sub}>
            A couple of permissions help AudioTracker play your files.
            {/* You can always change these later in system settings. */}
          </Text>

          <View style={styles.rows}>
            {rows.map(row => {
              const ok = !!granted?.[row.key];
              return (
                <View key={row.key} style={styles.row}>
                  <View style={[styles.iconWrap, ok && styles.iconWrapDone]}>
                    <Ionicons
                      name={ok ? 'checkmark' : row.icon}
                      size={20}
                      color={ok ? '#15803d' : '#334155'}
                    />
                  </View>

                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowText}>{row.body}</Text>
                  </View>

                  {ok ? (
                    <Text style={styles.done}>Allowed</Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.button}
                      disabled={busy === row.key}
                      onPress={() => request(row.key)}>
                      {busy === row.key ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>
                          {exhausted[row.key] ? 'Settings' : 'Allow'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* Only once a dialog has stopped working. Saying it up front would
            teach every new user that there is a harder path when there is
            not. */}
          {(exhausted.notifications || exhausted.media) && (
            <Text style={[styles.hint, styles.hintFirst]}>
              Tap Settings above, turn it on, then come back.
            </Text>
          )}

          {/* Down here with the sentence that already sends them to Settings,
            rather than under the rows: those are a list of two things to
            grant, and a menu path growing out of one of them made the list
            read as something else halfway down.

            Only for a permission whose dialogs are spent, and only while it
            is still missing — the block disappears the moment the switch is
            found, which is the confirmation that it was the right one. */}
          {settingsPaths
            .filter(
              path =>
                exhausted[path.key] &&
                !granted?.[path.key] &&
                !!path.lines?.length,
            )
            .map(path => (
              <View key={path.key} style={styles.hintSteps}>
                {path.lines.map(line => (
                  <Text key={line} style={styles.hint}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
        </>
      )}
    </View>
  );
};

export default PermissionGate;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
  },
  rows: {
    marginTop: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  iconWrapDone: {
    backgroundColor: '#dcfce7',
  },
  rowBody: {
    flex: 1,
    marginHorizontal: 14,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
  },
  button: {
    minWidth: 78,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  done: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803d',
  },
  // The gap belongs to the block, not to every line in it: hint carries no
  // margin of its own, so the path reads as one short list rather than three
  // separate paragraphs.
  hintSteps: {
    // marginTop: 12,
  },
  hintFirst: {
    marginTop: 24,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94a3b8',
  },
});
