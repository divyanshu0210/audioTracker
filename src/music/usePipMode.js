import {useCallback, useEffect, useState} from 'react';
import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

const {PipModule} = NativeModules;

/**
 * Picture-in-Picture for the player screen.
 *
 * PiP is not background playback: the activity stays *visible* in a small
 * window, so media keeps playing for the ordinary reason that the user can
 * still see it. That is what makes it work for the YouTube path, whose embed
 * pauses itself the moment its page is hidden.
 *
 * `armPip` is what makes pressing Home shrink the app instead of backgrounding
 * it, so it must be armed only while a video is actually playing.
 */
export const usePipMode = () => {
  const [isInPip, setIsInPip] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = DeviceEventEmitter.addListener(
      'pipModeChanged',
      event => setIsInPip(!!event?.isInPipMode),
    );
    return () => subscription.remove();
  }, []);

  const armPip = useCallback(async (enabled, width = 16, height = 9) => {
    if (Platform.OS !== 'android' || !PipModule) return;
    try {
      await PipModule.armPip(enabled, Math.round(width), Math.round(height));
    } catch (e) {
      console.log('[PIP] arm failed:', e);
    }
  }, []);

  const enterPip = useCallback(async (width = 16, height = 9) => {
    if (Platform.OS !== 'android' || !PipModule) return false;
    try {
      return await PipModule.enterPipMode(Math.round(width), Math.round(height));
    } catch (e) {
      console.log('[PIP] enter failed:', e);
      return false;
    }
  }, []);

  const isPipSupported = useCallback(async () => {
    if (Platform.OS !== 'android' || !PipModule) return false;
    try {
      return await PipModule.isSupported();
    } catch {
      return false;
    }
  }, []);

  return {isInPip, armPip, enterPip, isPipSupported};
};
