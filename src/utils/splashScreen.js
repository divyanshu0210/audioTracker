import {NativeModules, Platform} from 'react-native';

const {SplashModule} = NativeModules;

/**
 * Lifts the cold-start splash.
 *
 * Call it from the first screen that paints, once it has actually painted —
 * that is the point of holding it at all. Until then the launch window stays
 * on the splash rather than on the white gap where the bundle is loading.
 *
 * Safe to call more than once, safe to call on a platform that has no splash
 * to lift, and safe to skip: the native side releases itself after a few
 * seconds regardless, so a missed call costs a pause, never a stuck app.
 */
export function hideSplashScreen() {
  if (Platform.OS !== 'android' || !SplashModule) {
    return;
  }
  SplashModule.hide();
}
