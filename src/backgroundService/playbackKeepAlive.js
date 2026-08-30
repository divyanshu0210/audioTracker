import {NativeModules, Platform} from 'react-native';

/**
 * Keeps the app process alive while media plays in the background.
 *
 * VLC's `playInBackground` only tells the *player* to keep decoding — it gives
 * the OS no reason to keep the *process* around. Once the app is backgrounded
 * it becomes a cached process and Android reclaims it after a few minutes,
 * which is what the "plays fine, then dies a few minutes in" crash actually is.
 * The only supported way to stay alive is to own a foreground service for as
 * long as playback lasts.
 *
 * That service is our own (native PlaybackService) rather than a task on
 * react-native-background-actions, because that library exposes a *single*
 * native service that downloads (backgroundDownloadService) and restore
 * (newBackgroundService) already share, and playback overlaps both:
 *   - the last download finishing calls BackgroundService.stop(), which would
 *     take playback's protection down with it;
 *   - playback holding the service makes enqueueDownload's isRunning() check
 *     believe a download task is already running, so it never starts one;
 *   - whichever started last owns the notification, so one clobbers the other.
 *
 * Backup is unaffected either way — it runs through WorkManager
 * (BackupWorker's own dataSync foreground service), not through this.
 */

const {PlaybackKeepAlive} = NativeModules;

let requested = false;

export const startPlaybackKeepAlive = async title => {
  if (Platform.OS !== 'android' || !PlaybackKeepAlive) return;
  if (requested) return;

  requested = true;
  try {
    const started = await PlaybackKeepAlive.start(title || '');
    // Android 12+ refuses a foreground-service start from a backgrounded
    // process. Clear the flag so the next play — or the next return to the
    // foreground — can try again instead of assuming we are protected.
    if (!started) requested = false;
  } catch (e) {
    requested = false;
    console.log('[KEEPALIVE] Failed to start playback service:', e);
  }
};

export const stopPlaybackKeepAlive = async () => {
  if (Platform.OS !== 'android' || !PlaybackKeepAlive) return;
  if (!requested) return;

  requested = false;
  try {
    await PlaybackKeepAlive.stop();
  } catch (e) {
    console.log('[KEEPALIVE] Failed to stop playback service:', e);
  }
};
