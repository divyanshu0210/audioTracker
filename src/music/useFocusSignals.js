// useFocusSignals.js
//
// The signals that say the sound has stopped reaching anyone.
//
// Focus mode's other gates ask whether the app is in front, which a person can
// satisfy by leaving the phone face-up on a desk. These ask something the app
// cannot otherwise see, and none of them needs cooperation: unplugging
// headphones, a call taking the audio, the volume going to zero, another app
// taking half the screen. See android/.../FocusSignalsModule.java.
//
// Two of them are not really about focus mode at all. Nothing in this app
// requested audio focus before, so a phone call did not pause a lecture - it
// played on underneath and was credited. That is a plain bug, and it is fixed
// here for every video rather than only the focused ones; see `always` below.

import {useCallback, useEffect, useRef} from 'react';
import {
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const {FocusSignalsModule} = NativeModules;

export const FocusSignal = {
  // Headphones out, or Bluetooth gone. The strongest of the four: nobody
  // unplugs and keeps listening.
  NOISY: 'becomingNoisy',
  // A call, an alarm, or another player took the audio.
  FOCUS_LOST: 'audioFocusLost',
  // The phone is ringing or in a call. Read from the audio mode rather than
  // inferred from focus, which turned out not to be reliable for this.
  CALL: 'callActive',
  // Music stream turned all the way down.
  VOLUME_ZERO: 'volumeZero',
  // Sharing the screen with another app.
  MULTI_WINDOW: 'multiWindow',
  // Walked off with it. Focus mode only, and only where the permission and the
  // hardware allow.
  WALKING: 'walking',
};

/**
 * Has step detection already been allowed?
 *
 * A check, never a prompt - for Settings, which wants to say whether the signal
 * is working without putting a dialog in front of anyone who only came to read.
 */
export const hasWalkingPermission = async () => {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  if (!permission) return true; // below API 29 the sensor needs no permission
  try {
    return await PermissionsAndroid.check(permission);
  } catch {
    return false;
  }
};

/**
 * Ask for step detection. Called from PermissionGate, which is the only place
 * that asks for it and the only place that explains it.
 *
 * Returns whether it ended up granted. An old device with no step sensor and an
 * Android below 29 both come back true - neither needs the permission, and the
 * gate must not sit waiting on something that cannot be granted.
 */
export const requestWalkingPermission = async () => {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  // Absent below API 29, where the sensor needs no permission at all.
  if (!permission) return true;
  try {
    // No rationale object, deliberately. Passing one makes RN put its own alert
    // in front of the system dialog whenever shouldShowRequestPermissionRationale
    // is true - so every ask after the first became two dialogs in a row saying
    // much the same thing. PermissionGate's row already explains this in plain
    // text immediately above the button that gets here.
    const granted = await PermissionsAndroid.request(permission);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Could not ask about step detection:', error?.message ?? error);
    return false;
  }
};

// The two that are ordinary media-player correctness rather than focus-mode
// policy. A lecture should stop when the headphones come out or a call
// arrives whether or not anyone opted into anything.
const ALWAYS = [FocusSignal.NOISY, FocusSignal.FOCUS_LOST, FocusSignal.CALL];

export const isAlwaysSignal = reason => ALWAYS.includes(reason);

/**
 * Subscribe to the native signals for as long as something is playing.
 *
 * @param active           whether to listen at all - playback running
 * @param focused          whether focus mode is on, which adds walking detection
 * @param manageAudioFocus false for a player that requests focus for itself
 * @param onSignal         called with a FocusSignal value
 */
export const useFocusSignals = ({
  active,
  focused,
  manageAudioFocus = true,
  onSignal,
}) => {
  // The callback is read through a ref so that changing it does not tear the
  // native listeners down and build them up again.
  const handlerRef = useRef(onSignal);
  useEffect(() => {
    handlerRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !FocusSignalsModule) return;
    if (!active) return;

    FocusSignalsModule.start(manageAudioFocus).catch(error =>
      console.warn('Could not start focus signals:', error?.message ?? error),
    );

    const signalSub = DeviceEventEmitter.addListener('focusSignal', event => {
      if (event?.reason) handlerRef.current?.(event.reason);
    });

    // Its own event rather than part of focusSignal: this one is a state that
    // can go both ways, and it is the activity that knows, not the module.
    const windowSub = DeviceEventEmitter.addListener(
      'multiWindowChanged',
      event => {
        if (event?.isInMultiWindowMode) {
          handlerRef.current?.(FocusSignal.MULTI_WINDOW);
        }
      },
    );

    return () => {
      signalSub.remove();
      windowSub.remove();
      FocusSignalsModule.stop().catch(() => {});
    };
  }, [active, manageAudioFocus]);

  // Steps are watched only while focus mode is on *and* something is playing,
  // and in its own effect so that switching focus mode mid-lecture does not
  // tear down the audio listeners and build them again.
  useEffect(() => {
    if (Platform.OS !== 'android' || !FocusSignalsModule) return;
    if (!active || !focused) return;

    let cancelled = false;
    FocusSignalsModule.startWalkingDetection()
      .then(started => {
        // False means no permission or no step sensor. Not an error, and not
        // worth telling anyone about - the other three signals still hold.
        if (!started && !cancelled) {
          console.log('Walking detection unavailable');
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      FocusSignalsModule.stopWalkingDetection().catch(() => {});
    };
  }, [active, focused]);

  /**
   * Is the volume at zero right now?
   *
   * The observer only reports the moment it reaches zero, which misses the
   * case that matters most - pressing play on a phone that was already
   * silenced. Callers ask before starting.
   */
  const checkMuted = useCallback(async () => {
    if (Platform.OS !== 'android' || !FocusSignalsModule) return false;
    try {
      return await FocusSignalsModule.isMuted();
    } catch (error) {
      // Not-muted on failure, so a broken read can never be the thing that
      // stops a lecture playing.
      console.warn('Could not read the volume:', error?.message ?? error);
      return false;
    }
  }, []);

  /** Is the app sharing the screen right now? Same reasoning as checkMuted. */
  const checkMultiWindow = useCallback(async () => {
    if (Platform.OS !== 'android' || !FocusSignalsModule) return false;
    try {
      return await FocusSignalsModule.isInMultiWindow();
    } catch (error) {
      console.warn('Could not read multi-window state:', error?.message ?? error);
      return false;
    }
  }, []);

  return {checkMuted, checkMultiWindow};
};

export default useFocusSignals;
