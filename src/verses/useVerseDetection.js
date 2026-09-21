// useVerseDetection.js
//
// When the listener runs, and what switching it on costs the person.
//
// The player owns a lot of lifecycle already; this keeps the verse feature's
// share of it out of BacePlayer. What it has to get right is mostly restraint:
// capture holds a foreground service, a speech model and an audio stream open,
// so it should run when there is something to hear and at no other time.
//
// Three things gate it: the preference, something actually playing, and the
// platform. Switching it on the first time is not free - a permission prompt, a
// system consent dialog and a hundred and ninety megabyte download - so
// `toggle` reports
// what it is doing rather than appearing to hang.

import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, ToastAndroid} from 'react-native';

import useSettingsStore from '../Settings/settingsStore';
import {flush, flushWhenOnline} from './feedback';
import {loadTuning, refreshTuning} from './tuning';
import useVerseStore, {setVersePosition} from './useVerseStore';
import {songFromTitle, verseFromTitle} from './verseTitle';
import {
  capabilities,
  enableListening,
  isSupportedPlatform,
  setCapturing,
  stopListening,
} from './verseRecognition';

const useVerseDetection = ({sourceId, title, path, isPaused, isPlaybackReady}) => {
  const preference = useSettingsStore(
    state => state.settings?.verseDetectionEnabled ?? false,
  );
  const updateSettings = useSettingsStore(state => state.updateSettings);

  const listening = useVerseStore(state => state.listening);
  const [preparing, setPreparing] = useState(false);
  const [modelProgress, setModelProgress] = useState(null);

  // Whether this device can do it at all, which is a stronger question than
  // "is it Android": playback capture arrived in Android 10. Asked once - the
  // answer cannot change while the app runs - and starts null so a control that
  // cannot work is never drawn and then removed.
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupportedPlatform) {
      setAvailable(false);
      return undefined;
    }
    capabilities().then(caps => {
      if (!cancelled) setAvailable(!!caps.supported);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whether capture is up, tracked here rather than read back from the store:
  // the effect below has to tell "should be running" from "is running" without
  // re-running every time the store changes.
  const runningRef = useRef(false);

  // The latest pause state, readable from the start-up path without making it a
  // dependency of the session effect - which would restart the session on every
  // play and pause, and restarting is what all of this exists to avoid.
  const pausedRef = useRef(isPaused);
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // Anything recorded while offline goes up now, and again whenever a
  // connection comes back. Opening the player is a good moment for it: there is
  // a network in use already, and nothing here blocks anything.
  useEffect(() => {
    flushWhenOnline();
    flush();

    // Whatever this device last learned, then whatever the server knows now.
    // In that order: the cached values are available immediately and work
    // offline, and the fetch corrects them a moment later if it can.
    loadTuning().then(refreshTuning);
  }, []);

  // Backgrounding is the last moment anything is guaranteed to run.
  //
  // Matches are held in memory until the recording changes or the player
  // closes, and a process that is swiped away reaches neither. This is the one
  // callback Android does deliver first, so it is where a lecture's worth of
  // data stops being lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        useVerseStore.getState().persist();
      }
    });
    return () => sub.remove();
  }, []);

  // A new recording is a new table of contents.
  useEffect(() => {
    useVerseStore.getState().reset();

    // These files are usually named by the verse they are about, which fills
    // the panel immediately rather than leaving it blank until the first hit.
    // Anything actually heard replaces it.
    const named = verseFromTitle(title, path);
    if (named) useVerseStore.getState().seedFromTitle(named, named.id);

    // A recording named after a song is that song, whatever is happening in the
    // first minute of it. Noted rather than shown - see expectSong.
    const song = songFromTitle(title, path);
    useVerseStore.getState().expectSong(song, song?.id);
  }, [sourceId, title, path]);

  // The preference is the person's answer; the store's `enabled` is what the
  // rest of the feature reads.
  useEffect(() => {
    useVerseStore.getState().setEnabled(preference && available !== false);
  }, [preference, available]);

  // Whether the capture *session* should exist - not the same question as
  // whether it should be reading right now.
  //
  // A pause deliberately does not appear here. Android will not let a
  // MediaProjection be re-acquired without asking again, so ending the session
  // on pause put a consent dialog in front of the person every time they
  // pressed play. The session spans the whole time the player is open; pausing
  // only closes the tap, in the effect below.
  const shouldListen = preference && available === true && isPlaybackReady;

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (shouldListen && !runningRef.current) {
        runningRef.current = true;
        const ok = await enableListening({
          onModelProgress: fraction => !cancelled && setModelProgress(fraction),
        });
        if (cancelled) return;
        setModelProgress(null);
        if (!ok) {
          // A failed start must not leave the flag set, or nothing will try
          // again for the rest of the session.
          runningRef.current = false;
        } else if (pausedRef.current) {
          // Opened onto a paused player - a note's timestamp link does this,
          // and so does pauseOnStart.
          setCapturing(false);
        }
      } else if (!shouldListen && runningRef.current) {
        runningRef.current = false;
        await stopListening();
      }
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [shouldListen]);

  // Playback pausing and resuming, within a session that stays up.
  useEffect(() => {
    if (!runningRef.current) return;
    setCapturing(!isPaused);
  }, [isPaused]);

  // Leaving the player stops the capture. Without this the foreground service
  // and its notification outlive the thing they were listening to.
  useEffect(
    () => () => {
      runningRef.current = false;
      stopListening();
      useVerseStore.getState().reset();
    },
    [],
  );

  /**
   * Turn it on or off.
   *
   * The first time on is where the cost is: the permission, the consent dialog
   * and the model download. Everything after is a flag flip.
   */
  const toggle = useCallback(async () => {
    if (preference) {
      updateSettings({verseDetectionEnabled: false});
      await stopListening();
      useVerseStore.getState().reset();
      return;
    }

    if (available !== true) {
      ToastAndroid?.show?.(
        'Verse detection needs Android 10 or newer',
        ToastAndroid.SHORT,
      );
      return;
    }

    setPreparing(true);
    try {
      const caps = await capabilities();
      if (!caps.modelReady) {
        ToastAndroid?.show?.(
          'Downloading the Sanskrit speech model — about 190 MB, once',
          ToastAndroid.LONG,
        );
      }
      updateSettings({verseDetectionEnabled: true});
    } finally {
      setPreparing(false);
    }
  }, [preference, available, updateSettings]);

  /**
   * Where the media is, in seconds.
   *
   * Called from the player's progress handler several times a second, so it
   * deliberately does not touch React state - see setVersePosition.
   */
  const reportPosition = useCallback(seconds => {
    setVersePosition(seconds);
  }, []);

  const onSeek = useCallback(() => {
    useVerseStore.getState().onSeek();
  }, []);

  const toggleDebug = useCallback(() => {
    useVerseStore.getState().toggleDebug();
  }, []);

  return {
    // Strictly true only once the check has come back, so a control that cannot
    // work is never drawn even for one frame.
    available: available === true,
    enabled: preference,
    listening,
    preparing,
    modelProgress,
    toggle,
    toggleDebug,
    reportPosition,
    onSeek,
  };
};

export default useVerseDetection;
