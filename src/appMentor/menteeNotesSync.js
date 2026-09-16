// menteeNotesSync.js
//
// The JS side of the mentee-notes sync, which is small on purpose: the work
// itself is native, in android/.../menteenotes.
//
// It had to be. The step everything else waits on is a mentee's device
// granting their mentor access to its Drive folder, and only that device can
// do it. If that only happened while the app was open, a mentee who never
// launches it would leave their mentor with nothing, indefinitely. On
// WorkManager it happens anyway: held until there is a network, retried on
// failure, surviving both process death and reboot.
//
// So what is left here is three small things that all belong together — tell
// the worker where the backend is, ask it to run, and hear when it finished.
// Reading the rows it wrote is database/menteeNotesDB.

import {useEffect} from 'react';
import {AppState, DeviceEventEmitter, NativeModules} from 'react-native';
import {create} from 'zustand';

const {BackupModule} = NativeModules;

/* ---------------------------------- */
/* Talking to the worker               */
/* ---------------------------------- */

/**
 * Hands the worker what it cannot work out for itself, and starts its
 * schedule.
 *
 * The base url is passed in rather than imported: it is defined in userMgt,
 * which imports this module, and reaching back for it would close a cycle
 * that only worked by accident of being read inside a function.
 *
 * It goes into the same SharedPreferences the backup timestamps use, where a
 * worker with no React context can read it. The url moves between local,
 * staging and production, so a second copy compiled into the app would be one
 * more thing to remember on every switch.
 */
export const setUpNativeMenteeSync = async baseUrl => {
  if (!BackupModule || !baseUrl) return;
  try {
    await BackupModule.setPreference('BACKEND_BASE_URL', baseUrl);
    BackupModule.scheduleMenteeNotesSync();
  } catch (error) {
    console.log('[MenteeNotes] Could not set up the native sync:', error?.message);
  }
};

/**
 * Asks for a pass now, for one mentee or for all of them.
 *
 * Pass an id whenever you know which mentee this is about — a push names one,
 * and so does picking one in the drawer. A pass costs a Drive listing per
 * mentee whether anything changed or not, so checking everybody to answer one
 * person's upload is what a mentor with a hundred mentees cannot afford.
 *
 * Enqueues and returns — the work outlives this process, which is the point:
 * callers include a headless push handler with seconds to live. A run that
 * finds nothing new is a listing and no downloads, so asking often is cheap.
 */
export const runNativeMenteeSyncNow = (menteeId = null) => {
  if (!BackupModule) return false;
  try {
    BackupModule.runMenteeNotesSyncNow(menteeId ?? null);
    return true;
  } catch (error) {
    console.log('[MenteeNotes] Could not start the native sync:', error?.message);
    return false;
  }
};

/* ---------------------------------- */
/* Hearing back                        */
/* ---------------------------------- */

/**
 * What the worker is doing, for screens that care.
 *
 * `syncedAt` is a timestamp rather than a flag so two runs in a row each wake
 * the reader, instead of the second being swallowed as "already synced".
 *
 * `syncing` exists because a first sync is a whole backup: without it a
 * mentor who has just picked a mentee sees an empty list, which looks like an
 * answer rather than a wait.
 */
export const useMenteeNotesStore = create(set => ({
  syncing: false,
  syncedAt: 0,
  markSyncing: () => set({syncing: true}),
  markSynced: () => set({syncing: false, syncedAt: Date.now()}),
}));

/**
 * Listens for the worker, wherever the app happens to be.
 *
 * Mounted once, high up, rather than by the screens that read the notes: the
 * work is started from the drawer and can finish after the mentor has
 * navigated somewhere else entirely, and a listener living on one screen
 * would miss exactly that.
 */
export const useMenteeNotesWorkerEvents = () => {
  useEffect(() => {
    const started = DeviceEventEmitter.addListener('menteeNotesSyncing', () =>
      useMenteeNotesStore.getState().markSyncing(),
    );
    const finished = DeviceEventEmitter.addListener('menteeNotesSynced', () =>
      useMenteeNotesStore.getState().markSynced(),
    );
    return () => {
      started.remove();
      finished.remove();
    };
  }, []);
};

/* ---------------------------------- */
/* Asking, while a screen is open      */
/* ---------------------------------- */

/**
 * Keeps `mentee`'s notes current for as long as this screen is mounted.
 *
 * No timer. A mentee's device announces its own uploads — see
 * notifyNotesUpdated — so a note lands here seconds after it reaches Drive,
 * and polling would only be asking repeatedly for news that arrives on its
 * own. This is left with the one case a push cannot cover: the app was in the
 * background, possibly not running, and may have missed one.
 */
export function useMenteeNotesSync(mentee) {
  // Only the id, and only to know whether a mentee is selected at all. The
  // worker fetches the list from the server itself, so nothing here needs the
  // object — which also means no ref, and no dependency array that restarts
  // on every render because `mentee` was rebuilt.
  const menteeId = mentee?.id;

  // Coming back to the app is the one moment a push cannot cover: it may
  // have been dropped while the process was gone. Picking the mentee already
  // asked once, and every upload since then announced itself, so there is
  // nothing else for this screen to do.
  //
  // Written out rather than borrowed from useMenteeStatusRefresh, which is
  // the obvious place to reach for: that module imports assignmentsMgt,
  // which imports userMgt, which imports this one — and userMgt only gets
  // away with that today because it reads the base url inside a function.
  // Eight lines is cheaper than a cycle held together by where a constant
  // happens to be read.
  useEffect(() => {
    if (!menteeId) return;
    const subscription = AppState.addEventListener('change', state => {
      // This mentee only — they are the one being looked at, and a push
      // about them may have been dropped while the app was away.
      if (state === 'active') runNativeMenteeSyncNow(menteeId);
    });
    return () => subscription.remove();
  }, [menteeId]);
}
