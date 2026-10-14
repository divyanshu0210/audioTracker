// useVerseDetection.js
//
// When the listener runs, and what switching it on costs the person.
//
// The player owns a lot of lifecycle already; this keeps the verse feature's
// share of it out of BacePlayer. What it has to get right is mostly restraint:
// capture holds a foreground service, a speech model and an audio stream open,
// so it should run when there is something to hear and at no other time.
//
// Three things gate it: an explicit button press, something actually playing, and the
// platform. Switching it on the first time is not free - a permission prompt, a
// system consent dialog and a hundred and ninety megabyte download - so
// `toggle` reports
// what it is doing rather than appearing to hang.

import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, ToastAndroid} from 'react-native';

import useSettingsStore from '../Settings/settingsStore';
import {flush, flushWhenOnline} from './feedback';
import {loadTuning} from './tuning';
import useVerseStore, {setVersePosition} from './useVerseStore';
import {songFromTitle, verseFromTitle} from './verseTitle';
import {
  capabilities,
  deleteModel,
  enableListening,
  pauseListening,
  releaseModelAfterIdle,
  isSupportedPlatform,
  setCapturing,
  stopListening,
} from './verseRecognition';

// Deliberately memory-only. This survives moving between player screens while
// the JS process remains alive, but resets to off when the app process starts
// again.
let sessionDetectionRequested = false;

const useVerseDetection = ({sourceId, title, path, isPaused, isPlaybackReady}) => {
  const updateSettings = useSettingsStore(state => state.updateSettings);

  const listening = useVerseStore(state => state.listening);
  const unavailable = useVerseStore(state => state.unavailable);
  const [preparing, setPreparing] = useState(false);
  // Recognition is explicitly opt-in for the current app session. The stored
  // setting remembers that the user has used the feature, but it must not
  // start capture after a fresh app launch.
  const [sessionRequestedState, setSessionRequestedState] = useState(
    () => sessionDetectionRequested,
  );
  const setSessionRequested = useCallback(value => {
    setSessionRequestedState(previous => {
      const next = typeof value === 'function' ? value(previous) : value;
      sessionDetectionRequested = next;
      return next;
    });
  }, []);
  const sessionRequested = sessionRequestedState;

  // Whether this device can do it at all, which is a stronger question than
  // "is it Android": playback capture arrived in Android 10. Asked once - the
  // answer cannot change while the app runs - and starts null so a control that
  // cannot work is never drawn and then removed.
  const [available, setAvailable] = useState(null);
  const [modelReady, setModelReady] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupportedPlatform) {
      setAvailable(false);
      return undefined;
    }
    const read = () => capabilities().then(caps => {
      if (!cancelled) {
        setAvailable(!!caps.supported);
        setModelReady(!!caps.modelReady);
      }
    });
    read();
    const poll = setInterval(() => {
      if (modelReady !== true) read();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [modelReady]);

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

    // Use the last locally cached tuning values. Rating uploads no longer
    // drive remote threshold changes.
    loadTuning();
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

  // The store's `enabled` flag follows the explicit button press for this
  // recording. Listening may begin while the player is still opening; the
  // panel independently waits for real playback before showing its status.
  useEffect(() => {
    useVerseStore.getState().setEnabled(sessionRequested && available !== false);
  }, [sessionRequested, available]);

  // Whether the capture *session* should exist - not the same question as
  // whether it should be reading right now.
  //
  // A pause deliberately does not appear here. Android will not let a
  // MediaProjection be re-acquired without asking again, so ending the session
  // on pause put a consent dialog in front of the person every time they
  // pressed play. The session spans the whole time the player is open; pausing
  // only closes the tap, in the effect below.
  const shouldListen = sessionRequested && available === true && isPlaybackReady;

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (shouldListen && !runningRef.current) {
        runningRef.current = true;
        const ok = await enableListening();
        if (cancelled) {
          // The recording may have changed while Android was showing the
          // consent dialog. Do not leave a capture service running for a
          // session that is already gone, or leave runningRef wedged true.
          runningRef.current = false;
          if (ok) await stopListening();
          return;
        }
        if (!ok) {
          // A failed start must not leave the flag set, or nothing will try
          // again for the rest of the session.
          runningRef.current = false;
          // Any failed startup should leave the feature visibly off. This
          // includes model/network failures as well as permission denial. We
          // do not revoke Android permission here, so a later manual retry can
          // proceed without showing the permission prompt again.
          setSessionRequested(false);
          updateSettings({verseDetectionEnabled: false});
          useVerseStore.getState().setEnabled(false);
        } else {
          // `start()` can resolve with an already-active service. That happens
          // after the player was paused or after leaving and re-entering the
          // screen. Explicitly restore the requested capture state; otherwise
          // the native service remains idle and the UI never receives a fresh
          // listening event.
          await setCapturing(!pausedRef.current);
        }
      } else if (!shouldListen && runningRef.current) {
        runningRef.current = false;
        // Keep the MediaProjection session alive for this player session.
        // Turning detection off pauses audio capture; it does not trigger a
        // second system consent dialog if the user enables it again.
        await setCapturing(false);
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

  // Leaving the player pauses capture and detaches this screen's listeners,
  // while the foreground service keeps the projection grant for the next
  // player screen in the same app session.
  useEffect(
    () => () => {
      runningRef.current = false;
      // Keep the projection service alive between player screens so the next
      // video can reuse the existing system grant without another dialog.
      pauseListening();
      releaseModelAfterIdle();
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
    if (sessionRequested) {
      setSessionRequested(false);
      updateSettings({verseDetectionEnabled: false});
      await setCapturing(false);
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
      setSessionRequested(true);
      updateSettings({verseDetectionEnabled: true});
    } finally {
      setPreparing(false);
    }
  }, [sessionRequested, available, modelReady, isPlaybackReady, updateSettings]);

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

  // Development control for repeating the first-run model path. Stop the
  // listener before deleting so an active recogniser cannot keep the file open.
  const removeModel = useCallback(async () => {
    updateSettings({verseDetectionEnabled: false});
    await stopListening();
    await deleteModel();
    setModelReady(false);
    ToastAndroid?.show?.('Speech model deleted', ToastAndroid.SHORT);
  }, [updateSettings]);

  return {
    // Strictly true only once the check has come back, so a control that cannot
    // work is never drawn even for one frame.
    available: available === true,
    modelReady: modelReady === true,
    enabled: sessionRequested,
    listening,
    unavailable,
    preparing,
    toggle,
    removeModel,
    toggleDebug,
    reportPosition,
    onSeek,
  };
};

export default useVerseDetection;
