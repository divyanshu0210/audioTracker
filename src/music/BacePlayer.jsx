import { useRoute} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  InteractionManager,
  Keyboard,
  NativeModules,
  PanResponder,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import Fontisto from 'react-native-vector-icons/Fontisto';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ViewShot from 'react-native-view-shot';
import {handleExport} from '../components/menu/NoteMenuItems';
import {useAppState} from '../contexts/AppStateContext';
import {fetchLatestWatchData} from '../database/R';
import RichTextEditor from '../notes/richEditor/RichTextEditor';
import VideoTracker from './videoTracker';
import useSettingsStore from '../Settings/settingsStore';
import VLCPlayerComponent from './VLCPlayer/VLCPlayerComponent';
import MediaUnavailable from './MediaUnavailable';
import YouTubePlayerComponent from './VLCPlayer/YouTubePlayerComponent ';
import AddNewNoteBtn from '../components/buttons/AddNewNoteBtn';
import PlayerQueue from './PlayerQueue';
import {saveDatatoBackend} from '../appMentorBackend/reportMgt';
import {useNotesStore} from '../stores/useNotesStore';
import {useShallow} from 'zustand/react/shallow';
import {useSelectionStore} from '../stores/useSelectionStore';
import { navigationRef } from '../handlers/navigationRef';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
import {
  startPlaybackKeepAlive,
  stopPlaybackKeepAlive,
} from '../backgroundService/playbackKeepAlive';
import {usePipMode} from './usePipMode';
import SaveToListBar from '../components/SaveToListBar';
import {isContentUri, isStreamUrl, resolvePlaybackPath} from './driveStream';
import useFocusSession, {CHECK_GRACE_MS} from './useFocusSession';
import useFocusSignals, {FocusSignal, isAlwaysSignal} from './useFocusSignals';
import FocusCheck from './FocusCheck';
// const {PipModule} = NativeModules;

// Guarded rather than assuming a string: a row off the report API spells the
// field mimetype and arrives here without this one, and an old items row may
// carry no mime at all. Unknown means not-audio, which is the video layout
// this has always defaulted to - a missing mime is no reason to take the
// player down before it draws.
const isAudioFile = mimeType =>
  typeof mimeType === 'string' && mimeType.startsWith('audio/');

// How much media time may sit unsaved before we force a write. Progress only
// reaches the DB when an interval closes, so without this a process death
// mid-session loses the *entire* session rather than a trailing few seconds.
const PROGRESS_CHECKPOINT_SECONDS = 120;

// How long typing must be idle before playback resumes. Long enough not to
// stutter between words and while thinking mid-sentence, short enough that
// finishing a note doesn't feel like the video forgot to come back.
const TYPING_RESUME_DELAY_MS = 700;

// Leading edge: the first tap acts, the ones crowding behind it are dropped.
// Android queues toasts with no way to cancel one, so five quick taps would
// leave five cycling long after the pill settled.
const FOCUS_TAP_INTERVAL_MS = 700;

// Shown when switching focus mode off. Random rather than fixed, because a
// line you have read nine times stops being read at all. None of them scolds:
// each is a reason to stay, not a suggestion you were wrong to reach for it.
// What to say when a signal stops playback. Short, because these arrive
// unasked for and the person can already see what happened.
const FOCUS_SIGNAL_MESSAGES = {
  becomingNoisy: 'Paused - headphones disconnected',
  audioFocusLost: 'Paused - something else took the audio',
  volumeZero: 'Paused - the volume is off',
  multiWindow: 'Paused - focus mode needs the whole screen',
  walking: 'Paused - pick it up again when you are settled',
};

const FOCUS_KEEP_ON_MESSAGES = [
  'A few focused minutes can make a bigger difference than you think.',
  'Give this your full attention for a little longer.',
  'Let this be the one thing you are doing right now.',
  'You do not need more time. You need a little more attention.',
  'Keep going. Your future self will be glad you stayed.',
  'Give this your full attention.Everything else can wait for later.',
  'One uninterrupted session can be worth more than hours of half-attention.',
  'Stay present. You might hear something you would have otherwise missed.',
  'Protect this time. It is yours.',
  'You are already focused. Just stay with it.',
  'No need to rush. Listen fully, and let it sink in.',
  'The distractions can wait. This moment cannot.',
  'Keep the noise out for a little longer. Let the message come through.',
  'Be here for this. The rest can wait.',
  'A little more focus. A little more understanding.',
   'Sometimes one sentence is enough to change your perspective.',
  'Give the speaker your full attention. You may hear something meant just for you.',
  'Do not just listen in the background. Be present for the message.',
  'Let the words reach you before you move on to the next thing.',
  'A focused mind receives more than a distracted one.',
  'Stay present. Understanding begins with listening.',
  'Give this time. Let the message settle before you move on.',
  'You pressed play for a reason. Stay long enough to discover it.',
  'For these few minutes, let this be the only thing that matters.',
  'What you hear today may stay with you for much longer.',
];

const randomKeepOnMessage = () =>
  FOCUS_KEEP_ON_MESSAGES[
    Math.floor(Math.random() * FOCUS_KEEP_ON_MESSAGES.length)
  ];

// Pale tint, saturated ink of the same hue - borrowed from the Pill styles in
// appMentor/AssignManifest.jsx. Light, not dark: this row sits on white while a
// video plays and on black once notes open (see focusPillHit). All three states
// share one glyph, so the tint is the only thing telling them apart.
const FOCUS_PILL_LOOKS = {
  off: {bg: '#f3f4f6', ink: '#6b7280'},
  on: {bg: '#eff6ff', ink: '#1d4ed8'},
  locked: {bg: '#fffbeb', ink: '#b45309'},
};

const NoteSection = React.memo(
  ({editorRef, source_type, playerRef, captureVLCScreenshot, showPlayerMinimized, isHidden, onTypingActivity, onImageOverlayChange}) => {
    const activeNoteId = useNotesStore(state => state.activeNoteId);

    // playerRef.current is still null while this renders — the player mounts
    // after — and React.memo means this may never render again, so resolving
    // the player's pieces here freezes them as null: timestamps seek nothing
    // and the screenshot button has no handler, until some unrelated prop
    // change happens to re-render this. Hand down accessors that read the ref
    // at the moment they are used instead.
    const playerWebViewRef = useMemo(
      () => ({
        get current() {
          return playerRef.current?.webViewRef?.current || null;
        },
      }),
      [playerRef],
    );
    const captureYouTubeScreenshot = useCallback(
      () => playerRef.current?.captureScreenshot?.(),
      [playerRef],
    );
    console.log('🔄 NoteSection RENDERING', new Date().toISOString());
    return (
      <View style={{flex: 1, marginTop: isHidden ? 5 : 50}}>
        <RichTextEditor
          ref={editorRef}
          noteId={activeNoteId}
          key={activeNoteId || 'new-note'}
          captureScreenshot={
            source_type === 'youtube_video'
              ? captureYouTubeScreenshot
              : captureVLCScreenshot
          }
          showPlayerMinimized={showPlayerMinimized}
          playerRef={playerRef}
          source_type={source_type}
          webViewRef={source_type === 'youtube_video' ? playerWebViewRef : null}
          isHidden={isHidden}
          onTypingActivity={onTypingActivity}
          onImageOverlayChange={onImageOverlayChange}
        />
      </View>
    );
  },
);

const BacePlayer = () => {
  console.log('🔄🔄🔄 BacePlayer RENDERING', new Date().toISOString());
  const appState = useRef(AppState.currentState);
  const route = useRoute();
  const {
    item,
    items: routeItems,
    pauseOnStart = false,
    currentIndex: routeCurrentIndex,
  } = route.params || {};
  const {settings} = useSettingsStore();
  const autoplay = settings?.autoplay ?? true;
  const autoPauseOnTyping = settings?.autoPauseOnTyping ?? true;

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Playlist state
  const [playlist, setPlaylist] = useState(routeItems || (item ? [item] : []));
  const [currentIndex, setCurrentIndex] = useState(routeCurrentIndex || 0);
  const currentItem = playlist[currentIndex] || null;

  // The download service writes file_path back to the items row, but the
  // playlist here came from route params and would keep showing the download
  // panel in front of a file that is now on disk. Patching it in place is what
  // hands the item over to the real player.
  const handleMediaDownloaded = useCallback((sourceId, localPath) => {
    if (!localPath) return;
    setPlaylist(prev =>
      prev.map(it =>
        it.source_id === sourceId ? {...it, file_path: localPath} : it,
      ),
    );
  }, []);

  // Drive files stream through the loopback proxy, so a download is no longer
  // a precondition for playing one. Resolving here rather than at each tap
  // covers every route into the player at once — a queue advance, a history
  // card, a note's timestamp — and each of those hands over a row whose
  // file_path is whatever the database happened to hold.
  const [isResolvingSource, setIsResolvingSource] = useState(false);
  // Bumped to run the resolve effect again. Mostly this happens by itself:
  // MediaUnavailable watches the connection and calls it the moment one comes
  // back, which is what makes a Drive file start playing without being asked.
  // Its button is the other caller, for the rarer case of being online and the
  // resolve failing anyway.
  //
  // The whole resolution is what is worth repeating — a returning connection
  // makes a Drive copy reachable, and nothing else in the player notices.
  // Stable through useCallback because it is a dependency of that listener's
  // effect: a new reference each render would re-subscribe it, losing the
  // record of having been offline and with it the transition to watch for.
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const retrySource = useCallback(() => setResolveAttempt(n => n + 1), []);

  const currentSourceId = currentItem?.source_id;
  useEffect(() => {
    // device_file too, for either of two reasons: one left where the user
    // keeps it plays through the proxy off its content:// uri, and one with a
    // Drive copy streams from that copy rather than being downloaded first.
    const streamable =
      currentItem?.type === 'drive_file' ||
      isContentUri(currentItem?.file_path) ||
      (currentItem?.type === 'device_file' && !!currentItem?.drive_file_id);
    if (!streamable) {
      setIsResolvingSource(false);
      return;
    }
    // Already streaming — re-resolving would mint a second url for the same
    // file and restart playback from the top.
    if (isStreamUrl(currentItem.file_path)) return;

    let cancelled = false;
    setIsResolvingSource(true);
    (async () => {
      const path = await resolvePlaybackPath(currentItem);
      if (cancelled) return;
      setIsResolvingSource(false);
      if (path === currentItem.file_path) return;

      // null is written through rather than ignored. An empty file_path is what
      // puts MediaUnavailable on screen — the panel renders on the absence of a
      // path, so leaving a dead one in place showed the player instead, sitting
      // at 00:00 over a file it could never open. Drive files were never caught
      // by this because theirs is already null until something downloads it;
      // a device file's is a uri, and a uri that has stopped working is still
      // a string.
      setPlaylist(prev =>
        prev.map(it =>
          it.source_id === currentSourceId ? {...it, file_path: path} : it,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
    // resolveAttempt as well, so a retry re-runs this. A connection returning
    // is invisible to everything else here.
  }, [currentSourceId, resolveAttempt]);

  // Seconds left before auto-advancing to the next item, or null when no
  // countdown is running — see handleAutoAdvance/stopAutoAdvanceCountdown.
  const [autoAdvanceSecondsLeft, setAutoAdvanceSecondsLeft] = useState(null);
  const autoAdvanceIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (autoAdvanceIntervalRef.current) {
        clearInterval(autoAdvanceIntervalRef.current);
      }
    };
  }, []);

  // Refs
  const captureRef = useRef(null);
  // Whether the pause currently in effect is ours (see handleImageOverlayChange).
  const pausedByOverlayRef = useRef(false);
  const startFrom = useRef(null);
  const notesSectionRef = useRef(null);
  const tracker = useRef(null);
  const playerRef = useRef(null);

  const currentTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const playbackSpeedRef = useRef(1);
  const isPausedRef = useRef(pauseOnStart ?? false);
  const durationRef = useRef(0);
  // Read by handleIsPausedChange for the playback notification. Refs, not
  // dependencies: that callback is handed to a memoized player, and rebuilding
  // it on every track change would defeat the memo.
  const currentItemTitleRef = useRef(null);
  // Whether this source can actually play with the app backgrounded. VLC can
  // (playInBackground). The YouTube path is an embed in a WebView, and the
  // embedded player pauses itself once the page is hidden — holding a
  // mediaPlayback service for it would just pin an undismissable "Playing"
  // notification over media that stopped.
  const canPlayInBackgroundRef = useRef(false);
  // PiP only makes sense for something with a picture — an audio file shrunk
  // into a video window is just an empty black rectangle.
  const isVideoRef = useRef(false);
  // Media position at the last durability checkpoint, in seconds. null until
  // the first progress event of a track.
  const lastCheckpointRef = useRef(null);
  // Auto-pause-while-typing state. The setting lives in a ref because
  // handleTypingActivity is passed through a memoized NoteSection into a
  // RichTextEditor memoized on noteId alone — a rebuilt callback would never
  // reach it, so the callback has to be stable and read the current value here.
  const autoPauseOnTypingRef = useRef(autoPauseOnTyping);
  // True only while playback is paused *by typing*, so we never resume
  // something the user paused themselves.
  const pausedByTypingRef = useRef(false);
  const typingResumeTimerRef = useRef(null);

  // State, not just durationRef: focus mode's lock is coverage over duration,
  // and the items row often stores 0 for something never played through. A ref
  // would never re-resolve.
  const [knownDuration, setKnownDuration] = useState(0);

  // Stop playback because a focus check went unanswered. Not tracked as "ours"
  // the way the typing pause is - this one stays until someone presses play.
  const pauseForFocus = useCallback(() => {
    if (!playerRef.current) return;
    if (isPausedRef.current) return;
    playerRef.current.togglePlayPause();
  }, []);

  const focus = useFocusSession({
    sourceId: currentItem?.source_id,
    // Either may be 0; resolveFocusMode holds the lock closed rather than guess.
    duration: knownDuration || currentItem?.duration || 0,
    onMissedCheck: pauseForFocus,
  });

  // A ref because reconcileKeepAlive and the PiP arming read it from callbacks
  // handed to memoized players, which must not gain a dependency.
  const focusOnRef = useRef(false);
  useEffect(() => {
    focusOnRef.current = focus.focusOn;
  }, [focus.focusOn]);

  /**
   * Something outside the app says nobody is listening any more.
   *
   * Two of these apply whatever focus mode is set to - headphones out and the
   * audio being taken are reasons to stop a lecture for anyone. The other two
   * are focus mode's own policy and are ignored when it is off, because a muted
   * video or a split screen is a choice someone is entitled to make on their
   * own library.
   */
  const handleFocusSignal = useCallback(
    reason => {
      if (!focusOnRef.current && !isAlwaysSignal(reason)) return;
      if (isPausedRef.current) return;

      pauseForFocus();
      const message = FOCUS_SIGNAL_MESSAGES[reason];
      if (message) ToastAndroid.show(message, ToastAndroid.SHORT);
    },
    [pauseForFocus],
  );

  // Listening costs an audio-focus request and two receivers, so it is held
  // only while something is actually playing.
  const [isPlayingForSignals, setIsPlayingForSignals] = useState(false);
  const {checkMuted, checkMultiWindow} = useFocusSignals({
    active: isPlayingForSignals,
    focused: focus.focusOn,
    onSignal: handleFocusSignal,
  });

  const focusLook = focus.locked
    ? FOCUS_PILL_LOOKS.locked
    : focus.focusOn
    ? FOCUS_PILL_LOOKS.on
    : FOCUS_PILL_LOOKS.off;

  // When the focus control was last acted on, for the guard below.
  const lastFocusTapRef = useRef(0);

  // See FOCUS_TAP_INTERVAL_MS.
  const focusTapAllowed = useCallback(() => {
    const now = Date.now();
    if (now - lastFocusTapRef.current < FOCUS_TAP_INTERVAL_MS) return false;
    lastFocusTapRef.current = now;
    return true;
  }, []);

  /**
   * A tap switches focus mode on, but will not switch it off.
   *
   * One-directional on purpose: the moment it is most tempting to reach for
   * this is the moment the check appears, which is the moment it most needs to
   * hold. Turning it on needs no such protection.
   *
   * The toast advertises the hold every time, not once - the control has no
   * label, and a gesture nobody knows about is the same as none.
   */
  const handleFocusPress = useCallback(() => {
    if (!focusTapAllowed()) return;

    if (focus.locked) {
      ToastAndroid.show(
        'Focus stays on until you watch this assignment once',
        ToastAndroid.LONG,
      );
      return;
    }

    if (!focus.focusOn) {
      focus.setFocus(true);
      ToastAndroid.show('Focus mode on', ToastAndroid.SHORT);
      return;
    }

    ToastAndroid.show(
      'Focus mode is on. Hold to turn it off',
      ToastAndroid.LONG,
    );
  }, [focus.locked, focus.focusOn, focus.setFocus, focusTapAllowed]);

  // The only way to switch focus mode off. The hold stops a reflex; the dialog
  // gives the person a moment to notice they were having one.
  const handleFocusLongPress = useCallback(() => {
    if (focus.locked) {
      if (!focusTapAllowed()) return;
      ToastAndroid.show(
        'Focus stays on until you watch this assignment once',
        ToastAndroid.LONG,
      );
      return;
    }

    // Not behind the tap guard: a hold cannot fire repeatedly by accident, and
    // swallowing one because a tap landed moments earlier loses the gesture
    // that counts.
    lastFocusTapRef.current = Date.now();

    // Same as a tap when it is off - a gesture that works one way round and not
    // the other reads as a broken button.
    if (!focus.focusOn) {
      focus.setFocus(true);
      ToastAndroid.show('Focus mode on', ToastAndroid.SHORT);
      return;
    }

    Alert.alert(
      'Are you sure you want to stop?',
      randomKeepOnMessage(),
      [
        // First and plain, so the easy answer changes nothing. Android
        // emphasises the last button, which is why this is not it.
        {text: 'Keep Focusing', style: 'cancel'},
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => {
            focus.setFocus(false);
            ToastAndroid.show('Focus mode off', ToastAndroid.SHORT);
          },
        },
      ],
      {cancelable: true},
    );
  }, [focus.locked, focus.focusOn, focus.setFocus, focusTapAllowed]);

  const [isAudio, setIsAudio] = useState(false);
  const {height: SCREEN_HEIGHT} = Dimensions.get('window');
  const AUDIO_MINIMIZED_RATIO = 0.18;
  const VIDEO_MINIMIZED_RATIO = 0.25;
  const AUDIO_PLAYER_HEIGHT = SCREEN_HEIGHT * AUDIO_MINIMIZED_RATIO;
  const MAXIMIZED_HEIGHT = SCREEN_HEIGHT;
  const MINIMIZED_HEIGHT = useRef(
    new Animated.Value(SCREEN_HEIGHT * VIDEO_MINIMIZED_RATIO),
  ).current;
  // Animations
  const playerHeight = useRef(
    new Animated.Value(MINIMIZED_HEIGHT._value),
  ).current;
  const pan = useRef(new Animated.Value(0)).current;
  // const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isHidden, setIsHidden] = useState(false);

  // Notes context
  const [showNotes, setShowNotes] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const {setActiveNoteId, setNotesList} = useNotesStore(
    useShallow(state => ({
      setActiveNoteId: state.setActiveNoteId,
      setNotesList: state.setNotesList,
    })),
  );

  // PiP keeps the activity visible in a small window instead of backgrounding
  // it, so playback continues for both players — including YouTube, whose embed
  // pauses itself only when its page is actually hidden.
  const {isInPip, armPip} = usePipMode();
  // Shadow ref so reconcileKeepAlive can read PiP state without becoming a
  // dependency of the callbacks handed to the memoized players.
  const isInPipRef = useRef(false);

  /**
   * Hold the foreground service whenever something is genuinely playing with
   * no guarantee of a full-screen activity behind it.
   *
   * PiP is why this includes YouTube. Normally YouTube gets no service — the
   * embed pauses itself when backgrounded, so the notification would lie. In
   * PiP it really is playing, and more importantly closing the PiP window
   * finishes the activity: with no service the process goes straight from
   * "visible activity" to empty (oom_adj ~999) and is killed while the final
   * saveWatchProgress transaction is still in flight, losing the whole PiP
   * session's progress.
   */
  const reconcileKeepAlive = useCallback(() => {
    // Focus mode refuses it: the service exists to keep media alive with no
    // visible activity, which is the state focus mode is there to prevent.
    const shouldHold =
      !focusOnRef.current &&
      !isPausedRef.current &&
      (canPlayInBackgroundRef.current || isInPipRef.current);

    if (shouldHold) {
      startPlaybackKeepAlive(currentItemTitleRef.current);
    } else {
      stopPlaybackKeepAlive();
    }
  }, []);

  const {setActiveItem} = useSelectionStore(
    useShallow(state => ({
      setActiveItem: state.setActiveItem,
    })),
  );

  // Helper function to get item properties
  const getItemProperties = item => {
    const TIME_FACTOR = item?.type !== 'youtube_video' ? 1000 : 1;
    const source_type = item?.type;
    const videoId = item?.source_id;
    return {TIME_FACTOR, source_type, videoId};
  };
  const {TIME_FACTOR, source_type, videoId} = getItemProperties(currentItem);

  // const checkPipSupport = async () => {
  //   const isSupported = await PipModule.isSupported();

  //   console.log('PiP supported:', isSupported);
  // };

  // Initialize player and load data
  useEffect(() => {
    if (currentItem) {
      console.log('bace player ', currentItem);
      currentItemTitleRef.current = currentItem.title;
      canPlayInBackgroundRef.current = currentItem.type !== 'youtube_video';
      setNotesList([]);
      setActiveItem({
        sourceId: currentItem.source_id,
        sourceType: currentItem.type,
        item: currentItem,
      });
      const tempIsAudio =
        source_type !== 'youtube_video' && isAudioFile(currentItem?.mimeType);
      setIsAudio(tempIsAudio);
      isVideoRef.current = !tempIsAudio;

      if (tempIsAudio) {
        // For audio items
        MINIMIZED_HEIGHT.setValue(AUDIO_PLAYER_HEIGHT);
        if (isMinimized) {
          playerHeight.setValue(AUDIO_PLAYER_HEIGHT);
        }
      } else {
        // For video items
        MINIMIZED_HEIGHT.setValue(SCREEN_HEIGHT * VIDEO_MINIMIZED_RATIO);
        if (isMinimized) {
          playerHeight.setValue(SCREEN_HEIGHT * VIDEO_MINIMIZED_RATIO);
        }
      }

      loadPreviousWatchData(videoId);
      // A new track measures its own length - carrying the last one's over
      // would resolve the lock against the wrong duration.
      setKnownDuration(0);
    }

    if (route.params?.currentNoteId) {
      setActiveNoteId(route.params?.currentNoteId);
      setShowNotes(true);
      hidePlayer();
    }

    navigationRef.getParent()?.setOptions({tabBarStyle: {display: 'none'}});
    return () => {
      navigationRef.getParent()?.setOptions({tabBarStyle: {display: 'flex'}});
      cleanupPlayer();
      deactivateKeepAwake();
      setActiveNoteId(null);
    };
    // Keyed on which item is playing, not on the object holding it. This
    // effect builds the VideoTracker, and anything that rewrites a field on
    // the playing row — the stream url resolved above, a download finishing —
    // used to hand it a new object and tear the tracker down mid-session. The
    // replacement never saw the onPlay that had already fired, so on the way
    // out onPause found no open interval, saved nothing, and the next visit
    // had no lastWatchTime to resume from.
  }, [currentSourceId]);

  // Handle playlist changes
  useEffect(() => {
    if (routeItems && routeItems.length > 0) {
      setPlaylist(routeItems);
      if (routeCurrentIndex !== undefined) {
        setCurrentIndex(routeCurrentIndex);
      }
    } else if (item) {
      setPlaylist([item]);
      setCurrentIndex(0);
    }
  }, [routeItems, item, routeCurrentIndex]);

  useEffect(() => {
    if (useNotesStore.getState().activeNoteId != null) setShowNotes(true);
    return useNotesStore.subscribe((state, prev) => {
      if (state.activeNoteId !== prev.activeNoteId && state.activeNoteId != null) {
        setShowNotes(true);
      }
    });
  }, []);

  const loadPreviousWatchData = async videoId => {
    if (!videoId) {
      console.log('no videoID for loading');
      setIsDataLoaded(true);
      return;
    }
    try {
      const data = await fetchLatestWatchData(videoId);
      console.log('fetched data on mounting', data);
      tracker.current = data
        ? new VideoTracker(
            videoId,
            data.newWatchTimes,
            data.todayIntervals,
            data.latestWatchedIntervals,
            data.lastWatchTime,
            data.unfltrdWatchTimePerDay,
            currentItem.duration,
            data.clockIntervals,
          )
        : new VideoTracker(videoId);

      startFrom.current = data?.lastWatchTime;
      console.log('lastWatchTime', data?.lastWatchTime);
      console.log('Intervals on Mounting', tracker.current?.getIntervals());
    } catch (error) {
      console.error('Error loading watch data:', error);
    } finally {
      setIsDataLoaded(true);
    }
  };

  const cleanupPlayer = useCallback(async () => {
    if (tracker.current) {
      console.log(
        'hitting pause on initiating saving for currTime',
        currentTimeRef.current,
      );
      tracker.current.onPause(currentTimeRef.current / TIME_FACTOR);
      tracker.current.onPlay(currentTimeRef.current / TIME_FACTOR); //create a new interval
      console.log('Saving progress.', durationRef.current);
      currentItem.duration = durationRef.current;
      tracker.current.saveProgressinDB();
      lastCheckpointRef.current = currentTimeRef.current / TIME_FACTOR;
      // Fire-and-forget: this is a network upload that can take several
      // seconds, and callers (handleNext/handlePrevious) await cleanupPlayer()
      // before switching videos — awaiting it here made every playlist
      // transition block on that round-trip. Progress is already persisted
      // locally above; saveDatatoBackend has its own try/catch, so a failure
      // here just logs, it doesn't need to be awaited to be handled.
      saveDatatoBackend(currentItem);
    } else {
      console.log('Tracker not initialized, skipping save.');
    }
  }, [currentItem, TIME_FACTOR]);

  useEffect(() => {
    return () => {
      stopPlaybackKeepAlive();
      armPip(false);
    };
  }, [armPip]);

  // Always call the current cleanupPlayer, never the one captured when the
  // listener was registered — that stale closure held the *first* currentItem,
  // so backgrounding after a track switch saved progress against the wrong item.
  const cleanupPlayerRef = useRef(cleanupPlayer);
  useEffect(() => {
    cleanupPlayerRef.current = cleanupPlayer;
  }, [cleanupPlayer]);

  // Entering PiP must acquire the service (see reconcileKeepAlive); leaving it
  // must flush progress *before* the activity goes away. onPictureInPictureMode
  // Changed(false) is delivered ahead of the teardown when the window is
  // closed with the X, so this is the last moment the PiP session's watch time
  // can still be written.
  const wasInPipRef = useRef(false);
  useEffect(() => {
    isInPipRef.current = isInPip;
    reconcileKeepAlive();

    if (wasInPipRef.current && !isInPip) {
      cleanupPlayerRef.current?.();
    }
    wasInPipRef.current = isInPip;
  }, [isInPip, reconcileKeepAlive]);

  useEffect(() => {
    const handleAppStateChange = async nextAppState => {
      if (nextAppState !== 'active' && appState.current === 'active') {
        // App is moving from foreground to background/inactive
        console.log('App is no longer active. Running function...');
        // Before the save, so what gets written ends where the person left.
        // Closes the ordinary hole: press Home, keep listening, get credited.
        if (focusOnRef.current) pauseForFocus();
        await cleanupPlayerRef.current();
      }

      // Re-arm the playback foreground service if something else took it over
      // while we were away (a restore shares the same native service). This is
      // a no-op when we still hold it, and it has to happen on the foreground
      // transition — Android 12+ won't let a backgrounded process start one.
      if (nextAppState === 'active') {
        reconcileKeepAlive();
      }

      appState.current = nextAppState; // Update current app state
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [pauseForFocus]);

  const handleCurrentTimeChange = useCallback(
    time => {
      // Track time jumps immediately when child updates
      if (tracker.current) {
        console.log(
          'video logs',
          currentTimeRef.current / TIME_FACTOR,
          playbackSpeedRef.current,
          isPausedRef.current,
        );
        const lastTime = lastTimeRef.current;
        const playbackSpeed = playbackSpeedRef.current;
        if (
          Math.abs(time - lastTime) /
            (TIME_FACTOR *
              (source_type !== 'youtube_video' ? 1 : playbackSpeed)) >
          9
        ) {
          console.log(
            'video skipped',
            lastTime / TIME_FACTOR,
            time / TIME_FACTOR,
          );
          tracker.current?.onPause(lastTime / TIME_FACTOR);
          console.log('Intervals', tracker.current?.getIntervals());
          tracker.current?.onPlay(time / TIME_FACTOR);
          // A seek already closed the interval — restart the checkpoint clock
          // from here rather than measuring across the jump.
          lastCheckpointRef.current = time / TIME_FACTOR;
        }

        // Periodic durability checkpoint: close the open interval, save, and
        // immediately reopen a new one at the same position — the same
        // close/save/reopen cleanupPlayer does, just on a cadence. Caps what a
        // process death can cost at PROGRESS_CHECKPOINT_SECONDS.
        //
        // Driven off progress events rather than a timer on purpose: Android
        // freezes JS timers the moment the activity pauses, which is exactly
        // when this needs to keep working.
        const seconds = time / TIME_FACTOR;
        if (!isPausedRef.current) {
          if (lastCheckpointRef.current === null) {
            lastCheckpointRef.current = seconds;
          } else if (
            Math.abs(seconds - lastCheckpointRef.current) >=
            PROGRESS_CHECKPOINT_SECONDS
          ) {
            lastCheckpointRef.current = seconds;
            tracker.current.onPause(seconds);
            tracker.current.onPlay(seconds);
            // Local write only. saveDatatoBackend is a network round trip and
            // has no business running every two minutes; the existing cleanup
            // paths still push to the backend.
            tracker.current.saveProgressinDB();
            console.log('progress checkpointed at', seconds);
          }
        }
      }

      currentTimeRef.current = time;
      lastTimeRef.current = time;
    },
    [tracker, TIME_FACTOR, source_type],
  );

  const handleIsPausedChange = useCallback(
    paused => {
      isPausedRef.current = paused;

      // Playback resumed while we were holding a typing-pause — since our own
      // resume clears the flag *before* toggling, this can only be the user
      // pressing play. Hand control back and stop tracking that pause as ours.
      if (!paused && pausedByTypingRef.current) {
        pausedByTypingRef.current = false;
        clearTimeout(typingResumeTimerRef.current);
        typingResumeTimerRef.current = null;
      }

      // Keep the screen on only while media is actively playing.
      if (paused) {
        deactivateKeepAwake();
      } else {
        activateKeepAwake();
      }

      // Hold a foreground service for as long as something is actually
      // playing. It has to be started here, from the foreground, and not when
      // the app backgrounds: Android 12+ rejects a foreground-service start
      // that comes from an already-backgrounded process, and by the time the
      // AppState 'change' handler runs we are past that window.
      reconcileKeepAlive();

      // Arm PiP only while a video is actually playing, so pressing Home from
      // anywhere else backgrounds the app normally. Never under focus mode,
      // where it would turn pressing Home into a way to keep playing.
      armPip(!paused && isVideoRef.current && !focusOnRef.current);

      // Called rather than watched, so play/pause still costs no render here.
      focus.onPlaybackChange(paused);

      // The native listeners are held only while something plays. React bails
      // out when the value is unchanged, so this costs one render per genuine
      // transition rather than one per report.
      setIsPlayingForSignals(!paused);

      // The volume observer only fires on the moment it reaches zero, and the
      // multi-window callback only on the moment it changes - so neither says
      // anything about pressing play on a phone that was already silenced, or
      // already sharing the screen. Both are asked directly at that point.
      if (!paused && focusOnRef.current) {
        checkMuted().then(muted => {
          if (muted) handleFocusSignal(FocusSignal.VOLUME_ZERO);
        });
        checkMultiWindow().then(shared => {
          if (shared) handleFocusSignal(FocusSignal.MULTI_WINDOW);
        });
      }

      // Handle play/pause tracking
      if (tracker.current) {
        console.log(
          'video logs on Play/pause',
          currentTimeRef.current / TIME_FACTOR,
          playbackSpeedRef.current,
          isPausedRef.current,
        );
        const currentTime = currentTimeRef.current;
        if (paused) {
          tracker.current?.onPause(currentTime / TIME_FACTOR);
        } else {
          tracker.current?.onPlay(currentTime / TIME_FACTOR);
        }
      }
    },
    [
      tracker,
      TIME_FACTOR,
      armPip,
      reconcileKeepAlive,
      focus.onPlaybackChange,
      checkMuted,
      checkMultiWindow,
      handleFocusSignal,
    ],
  );

  // Focus mode resolves asynchronously, so it can come on after media has
  // started - by which point PiP is armed and the service may be held. Waiting
  // for the next play/pause to reconcile them might wait forever.
  useEffect(() => {
    if (!focus.focusOn) return;
    armPip(false);
    reconcileKeepAlive();
    if (!isPausedRef.current) focus.onPlaybackChange(false);
  }, [focus.focusOn, focus.onPlaybackChange, armPip, reconcileKeepAlive]);

  useEffect(() => {
    autoPauseOnTypingRef.current = autoPauseOnTyping;
    // Turning the setting off mid-note shouldn't strand the media paused.
    if (!autoPauseOnTyping && pausedByTypingRef.current) {
      pausedByTypingRef.current = false;
      clearTimeout(typingResumeTimerRef.current);
      typingResumeTimerRef.current = null;
      if (isPausedRef.current) playerRef.current?.togglePlayPause();
    }
  }, [autoPauseOnTyping]);

  useEffect(() => {
    return () => clearTimeout(typingResumeTimerRef.current);
  }, []);

  /**
   * Called on every keystroke in the note editor (content or title).
   *
   * Pauses on the first keystroke and resumes once typing has been idle for
   * TYPING_RESUME_DELAY_MS. Both directions go through togglePlayPause guarded
   * by isPausedRef rather than blind toggling, so a state we didn't expect
   * never flips playback the wrong way.
   *
   * Stable by design — see autoPauseOnTypingRef.
   */
  /**
   * Called when a full-screen image overlay opens or closes in the note — the
   * zoom viewer, and the cropper it leads into.
   *
   * Same bargain as typing: the video is behind a modal nobody can see, so it
   * shouldn't run on. Ownership is tracked the same way too — a video already
   * paused when the overlay opens was paused by the user (or by their typing),
   * and is left alone in both directions.
   */
  const handleImageOverlayChange = useCallback(open => {
    if (!autoPauseOnTypingRef.current) return;
    if (!playerRef.current) return;

    if (open) {
      if (isPausedRef.current) return;
      playerRef.current.togglePlayPause();
      pausedByOverlayRef.current = true;
    } else if (pausedByOverlayRef.current) {
      pausedByOverlayRef.current = false;
      if (isPausedRef.current) playerRef.current.togglePlayPause();
    }
  }, []);

  const handleTypingActivity = useCallback(() => {
    // Ahead of the autoPauseOnTyping guard: writing a note is the strongest
    // evidence of attention there is, whether or not that setting is on.
    focus.onPresenceSignal();

    if (!autoPauseOnTypingRef.current) return;
    if (!playerRef.current) return;

    // First keystroke of this burst: pause, and remember the pause is ours.
    // If it is already paused, leave it alone — that pause belongs to the user.
    if (!pausedByTypingRef.current) {
      if (isPausedRef.current) return;
      playerRef.current.togglePlayPause();
      pausedByTypingRef.current = true;
    }

    // Every keystroke pushes the resume back out.
    clearTimeout(typingResumeTimerRef.current);
    typingResumeTimerRef.current = setTimeout(() => {
      typingResumeTimerRef.current = null;
      if (!pausedByTypingRef.current) return;
      // Clear before toggling so handleIsPausedChange doesn't read our own
      // resume as the user taking over.
      pausedByTypingRef.current = false;
      if (isPausedRef.current) playerRef.current?.togglePlayPause();
    }, TYPING_RESUME_DELAY_MS);
  }, [focus.onPresenceSignal]);

  const handlePlaybackRateChange = useCallback(speed => {
    playbackSpeedRef.current = speed;
  }, []);

  const updateDuration = useCallback(async (duration) => {
    if (playerRef.current) {
      durationRef.current = duration;
      // Mirrored into state so the lock re-resolves against a real length.
      // Guarded: this fires repeatedly, and setting state per report would
      // re-render the player on a loop.
      setKnownDuration(previous =>
        duration > 0 && duration !== previous ? duration : previous,
      );
    }
  }, [playerRef.current]);

  // Countdown before auto-advancing to the next playlist item when a track
  // ends on its own — an instant jump (now that cleanupPlayer's backend
  // upload no longer blocks it, see cleanupPlayer) feels too abrupt, and the
  // user may want to stay on the video that just ended instead of moving on.
  // Manual skip-next/previous stay instant; this only wraps the onEnd path.
  const AUTOPLAY_NEXT_DELAY_SEC = 5;

  const stopAutoAdvanceCountdown = useCallback(() => {
    if (autoAdvanceIntervalRef.current) {
      clearInterval(autoAdvanceIntervalRef.current);
      autoAdvanceIntervalRef.current = null;
    }
    setAutoAdvanceSecondsLeft(null);
  }, []);

  // Single switch-to-item routine shared by skip-next, skip-previous and the
  // queue's tap-to-jump: save progress on the item being left, then reset the
  // per-item playback state. These are memoized because PlayerQueue is memo'd
  // — BacePlayer re-renders on things the queue doesn't care about (the
  // auto-advance countdown alone re-renders it once a second), and unstable
  // callbacks would defeat that memo every time.
  const goToIndex = useCallback(
    async index => {
      if (!autoplay || index === currentIndex) return;
      if (index < 0 || index > playlist.length - 1) return;
      stopAutoAdvanceCountdown();
      await cleanupPlayer();
      setActiveNoteId(null);
      setCurrentIndex(index);
      setIsDataLoaded(false);
      currentTimeRef.current = 0;
      lastTimeRef.current = 0;
      lastCheckpointRef.current = null;
      setShowNotes(false);
      setIsMinimized(true);
    },
    [
      autoplay,
      currentIndex,
      playlist.length,
      cleanupPlayer,
      setActiveNoteId,
      stopAutoAdvanceCountdown,
    ],
  );

  // Handle playlist navigation
  const handleNext = useCallback(
    () => goToIndex(currentIndex + 1),
    [goToIndex, currentIndex],
  );

  const handlePrevious = useCallback(
    () => goToIndex(currentIndex - 1),
    [goToIndex, currentIndex],
  );

  const handleAutoAdvance = () => {
    if (!autoplay || currentIndex >= playlist.length - 1) return;
    setAutoAdvanceSecondsLeft(AUTOPLAY_NEXT_DELAY_SEC);
    autoAdvanceIntervalRef.current = setInterval(() => {
      setAutoAdvanceSecondsLeft(prev => {
        if (prev === null) return null; // cancelled mid-tick
        if (prev <= 1) {
          clearInterval(autoAdvanceIntervalRef.current);
          autoAdvanceIntervalRef.current = null;
          handleNext();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const captureVLCScreenshot = useCallback(async () => {
    try {
      const base64Data = await captureRef.current.capture();
      const result = {
        data: base64Data,
        mime: 'image/jpeg',
      };
      notesSectionRef.current?.handleImagePickerResult(result);
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    }
  }, []);

  const handleOpenBottomMenu = () => {
    Keyboard.dismiss();
    notesSectionRef.current?.blurEditor();
    // Size the notes sheet to whatever's left below the player's current
    // height, so it sits flush under it instead of a fixed/mismatched detent.
    const playerHeightFraction = playerHeight._value / SCREEN_HEIGHT;
    const detent = Math.min(0.95, Math.max(0.5, 1 - playerHeightFraction));
    setTimeout(() => {
      navigationRef.navigate('ItemNotesScreen', {
        showHeader: true,
        item: currentItem,
        detent,
      });
    }, 150);
  };
  const handleBackPress = useCallback(() => {
    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
    } else {
      navigationRef.reset({
        index: 0,
        routes: [
          {
            name: 'MainApp',
            state: {
              index: 0,
              routes: [{name: 'Notes'}],
            },
          },
        ],
      });
    }
  }, []);

  // Player size management
  const hidePlayer = useCallback(() => {
    Animated.timing(playerHeight, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsHidden(true);
    setIsMinimized(false);
  }, []);

  const showPlayerMinimized = useCallback(() => {
    console.log('MINIMIZED_HEIGHT', MINIMIZED_HEIGHT._value);
    Animated.timing(playerHeight, {
      toValue: MINIMIZED_HEIGHT._value,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsHidden(false);
    setIsMinimized(true);
  }, [MINIMIZED_HEIGHT, playerHeight]);

  const minimizePlayer = useCallback(() => {
    showPlayerMinimized();
  }, [MINIMIZED_HEIGHT, playerHeight]);

  const maximizePlayer = useCallback(() => {
    Animated.timing(playerHeight, {
      toValue: MAXIMIZED_HEIGHT,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setIsHidden(false);
    setIsMinimized(false);
  }, []);

  const togglePlayerSize = useCallback(() => {
    if (!isMinimized) {
      minimizePlayer();
    } else {
      maximizePlayer();
      setShowNotes(false);
    }
  }, [isMinimized, minimizePlayer, maximizePlayer]);

  // Pan responder for drag gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (Math.abs(gestureState.dy) > 0) {
          pan.setValue(-gestureState.dy);
          // setIsDragging(true);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -30) {
          hidePlayer();
        } else if (gestureState.dy > 30) {
          showPlayerMinimized();
        }
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: false,
        }).start(() =>{ 
          //setIsDragging(false) 
          });
      },
    }),
  ).current;

  const renderDragHandle = () => {
    if ((isMinimized || isHidden) && showNotes) {
      return (
        <Animated.View
          style={[
            styles.dragHandleContainer,
            {
              top: isHidden ? 0 : MINIMIZED_HEIGHT._value - 20,
              transform: [{translateY: pan}],
            },
          ]}
          {...panResponder.panHandlers}>
          {isHidden && <View style={styles.dragHandle} />}
          <Icon
            name={isHidden ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
            size={20}
            color="#666"
          />
          {!isHidden && <View style={styles.dragHandle} />}
        </Animated.View>
      );
    }
    return null;
  };

  const renderPersistentBackButton = () => {
    if (isHidden) {
      return (
        <View style={{flexDirection: 'row', justifyContent: 'space-around'}}>
          <TouchableOpacity
            onPress={handleBackPress}
            style={styles.persistentBackButton}>
            <Icon name="arrow-back" size={26} color="black" />
          </TouchableOpacity>
          <View style={{flex: 1}}></View>
          <TouchableOpacity
            onPress={() => {
              handleExport(useNotesStore.getState().activeNoteId, 'pdf');
            }}
            style={styles.persistentBackButton}>
            <Fontisto name="share-a" size={18} color="black" />
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {currentItem ? (
        <>
          <Animated.View
            style={[
              styles.playerContainer,
              {height: playerHeight},
              isAudio && styles.audioPlayerContainer,
              // In PiP the window *is* the player — the animated height and the
              // audio sizing are both meaningless there.
              isInPip && styles.pipPlayerContainer,
            ]}>
            <ViewShot
              ref={captureRef}
              options={{format: 'jpg', quality: 0.9, result: 'base64'}}
              style={[
                styles.viewShot,
                isHidden && !isInPip && {opacity: 0, height: 0},
              ]}>
              {!isDataLoaded && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
              {source_type === 'youtube_video' ? (
                isDataLoaded && (
                  <YouTubePlayerComponent
                    ref={playerRef}
                    item={currentItem}
                    notesSectionRef={notesSectionRef}
                    onBack={handleBackPress}
                    onCurrentTimeChange={handleCurrentTimeChange}
                    onIsPausedChange={handleIsPausedChange}
                    onPlayBackRateChange={handlePlaybackRateChange}
                    updateDuration={updateDuration}
                    pauseOnStart={pauseOnStart}
                    startTime={startFrom?.current}
                    onEnd={handleAutoAdvance}
                  />
                )
              ) : currentItem.file_path ? (
                isDataLoaded && (
                  <VLCPlayerComponent
                    ref={playerRef}
                    item={currentItem}
                    isAudio={isAudio}
                    onToggleSize={togglePlayerSize}
                    isMinimized={isMinimized}
                    onBack={handleBackPress}
                    onCurrentTimeChange={handleCurrentTimeChange}
                    onIsPausedChange={handleIsPausedChange}
                    onPlayBackRateChange={handlePlaybackRateChange}
                    updateDuration={updateDuration}
                    pauseOnStart={pauseOnStart}
                    startTime={startFrom?.current}
                    onEnd={handleAutoAdvance}
                    focusMode={focus.focusOn}
                  />
                )
              ) : isResolvingSource ? (
                // Working out where a Drive file plays from — a disk check,
                // and starting the proxy on the first stream of the session.
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : (
                // No path and not a YouTube video: media that came with a
                // shared note and was never fetched, a device file whose row
                // outlived its bytes, or a Drive file with no local copy and
                // no connection to stream over. This branch used to render
                // nothing, leaving a black rectangle with no explanation.
                <MediaUnavailable
                  item={currentItem}
                  onRetry={retrySource}
                  onDownloaded={handleMediaDownloaded}
                />
              )}
            </ViewShot>

            {/* Not in PiP: focus mode never arms it, so a prompt there would
                be a check nobody could have earned. */}
            {!isInPip && (
              <FocusCheck
                visible={focus.prompting}
                graceMs={CHECK_GRACE_MS}
                onConfirm={focus.confirmPresence}
                // An audio player is barely a third of the screen; the stacked
                // layout does not fit inside one.
                compact={isAudio}
              />
            )}

            {autoAdvanceSecondsLeft !== null && !isInPip && (
              <View style={styles.autoAdvanceOverlay}>
                <Text style={styles.autoAdvanceText}>
                  Next video in {autoAdvanceSecondsLeft}s
                </Text>
                <TouchableOpacity
                  style={styles.autoAdvanceCancelBtn}
                  onPress={stopAutoAdvanceCountdown}>
                  <Text style={styles.autoAdvanceCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.btnContainer, isInPip && styles.hidden]}>
              {/* Grouped left so the middle stays empty: space-between put the
                  pill dead centre, which is where renderDragHandle draws the
                  grab bar while notes are open. They collided. */}
              <View style={styles.btnGroup}>
                <TouchableOpacity
                  style={styles.addButton}
                  disabled={isCreatingNote}
                  onPress={handleOpenBottomMenu}>
                  <Text style={styles.name}>All Notes</Text>
                </TouchableOpacity>

                {/* Here rather than the VLC gear menu, which the YouTube path
                    does not have - focus mode applies to both.

                    Shown even when off, and shown locked rather than hidden: a
                    mentee who cannot turn it off is owed the reason.

                    Unlabelled and asymmetric - a tap switches it on, only a
                    hold plus a confirmation switches it off. The toast stands
                    in for the label; Settings explains what the mode does. */}
                <TouchableOpacity
                  style={styles.focusPillHit}
                  activeOpacity={focus.locked ? 0.9 : 0.75}
                  onPress={handleFocusPress}
                  onLongPress={handleFocusLongPress}
                  // Longer than the 500ms default: it has to feel like holding.
                  delayLongPress={650}
                  accessibilityRole="switch"
                  accessibilityState={{
                    checked: focus.focusOn,
                    disabled: focus.locked,
                  }}
                  accessibilityLabel="Focus mode"
                  // The two directions use different gestures, so a fixed hint
                  // would be wrong half the time.
                  accessibilityHint={
                    focus.locked
                      ? 'Stays on until you have watched this assignment once'
                      : focus.focusOn
                      ? 'Double tap and hold to switch focus mode off'
                      : 'Double tap to switch focus mode on'
                  }>
                  <View
                    style={[styles.focusPill, {backgroundColor: focusLook.bg}]}>
                    {/* One glyph for all three states, with colour carrying the
                        difference. A padlock said "forbidden" about something
                        working exactly as intended; the toast explains instead.
                        21 in a 32 circle - about the most it holds without the
                        glyph touching the edge. */}
                    <Icon
                      name="self-improvement"
                      size={21}
                      color={focusLook.ink}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <AddNewNoteBtn
                renderItem={() => (
                  <View style={styles.addButton}>
                    {isCreatingNote ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.name}>
                        {showNotes ? 'Close' : '+Notes'}
                      </Text>
                    )}
                  </View>
                )}
                onNoteAdded={() => {
                  setShowNotes(true);
                  !isMinimized &&
                    !currentItem?.type?.startsWith('youtube') &&
                    togglePlayerSize();
                  setIsCreatingNote(false);
                }}
                beforeNoteCreated={() => {
                  if (showNotes) {
                    setShowNotes(false);
                    return false; // <- block note creation
                  }
                  setIsCreatingNote(true);
                  return true;
                }}
                disabled={isCreatingNote}
              />
            </View>
          </Animated.View>

          {!isInPip && renderPersistentBackButton()}
          {!isInPip && renderDragHandle()}
          {!showNotes && autoplay && !isInPip && (
            <PlayerQueue
              playlist={playlist}
              currentIndex={currentIndex}
              currentTitle={currentItem?.title}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onJumpToIndex={goToIndex}
            />
          )}

          {showNotes && !isInPip && (
            <NoteSection
              editorRef={notesSectionRef}
              source_type={source_type}
              playerRef={playerRef}
              captureVLCScreenshot={captureVLCScreenshot}
              showPlayerMinimized={showPlayerMinimized}
              isHidden={isHidden}
              onTypingActivity={handleTypingActivity}
              onImageOverlayChange={handleImageOverlayChange}
            />
          )}

          {/* Only ever visible for something opened from outside the library
              (or attached to a shared note) — it renders nothing for an item
              that is already in a list. Not while notes are open: the editor
              owns the bottom of the screen then, and not in PiP, where there
              is no room for anything but the video. */}
          {!isInPip && !showNotes && <SaveToListBar item={currentItem} />}
        </>
      ) : (
        // Nothing is loading, and nothing is going to: the player was handed
        // no item at all. Every route that opens it can do this - a shared
        // note whose media stayed on the sender's phone carries a link to
        // nothing, a mentee's note points at an item that has not synced, and
        // a timestamp tapped inside either lands here too, because
        // seekToTimestamp shows the player unconditionally.
        //
        // "Loading..." promised that something was on its way, on a white
        // screen whose own back button lives inside the branch above - so the
        // only way out was the system gesture. Say what happened instead, and
        // give them the way back.
        <View style={styles.nothingToPlay}>
          <TouchableOpacity
            onPress={handleBackPress}
            style={styles.nothingToPlayBack}>
            <Icon name="arrow-back" size={26} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.nothingToPlayBody}>
            <Icon name="cloud-off" size={34} color="#94a3b8" />
            <Text style={styles.nothingToPlayTitle}>Nothing to play</Text>
            <Text style={styles.nothingToPlayMessage}>
              The recording this note was taken against isn't on this device. A
              note carries a link to its media, not the media itself, so a file
              kept on someone else's phone never travels with it.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  nothingToPlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  nothingToPlayBack: {
    paddingHorizontal: 15,
    paddingTop: 10,
    alignSelf: 'flex-start',
  },
  nothingToPlayBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    // Lifted off the true centre so the block sits where the eye lands rather
    // than halfway down an empty screen.
    paddingBottom: 60,
  },
  nothingToPlayTitle: {
    marginTop: 10,
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  nothingToPlayMessage: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  pipPlayerContainer: {flex: 1, height: '100%'},
  hidden: {display: 'none'},
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  playerContainer: {
    width: '100%',
    backgroundColor: 'black',
  },
  viewShot: {
    height: '100%',
  },
  dragHandleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    backgroundColor: 'transparent',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#666',
    marginBottom: 4,
  },
  persistentBackButton: {
    top: 10,
    left: 0,
    right: 0,
    width: 60,
    paddingHorizontal: 15,
    paddingVertical: 4,
    zIndex: 20,
  },
  btnContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  controlButton: {
    padding: 5,
  },
  name: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    margin: 2,
  },
  addButton: {
    backgroundColor: '#555',
    borderRadius: 5,
    margin: 10,
    // padding: 10,
  },
  audioPlayerContainer: {
    borderBottomEndRadius: 5,
    borderBottomStartRadius: 5,
    borderRadius: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  btnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Why every fill in this row must be opaque: btnContainer lays out *past*
  // playerContainer's animated height (the ViewShot above it is height:'100%'),
  // so while a video plays it paints over container's white. Open the notes and
  // isHidden collapses that ViewShot, the row slides up onto the black, and the
  // same pixels sit on a dark surface. An outlined chip in white ink was
  // invisible for the whole time a video played.
  //
  // alignSelf, not alignItems on btnContainer, so centring this does not change
  // how the taller buttons beside it lay out.
  focusPillHit: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  // A circle, not the oblong the tint came from: a pill shape with one glyph
  // rattling around in it looks like a label whose text failed to load. Fixed
  // 32 square to sit level with addButton, which is a bare box around 16px
  // text - a little over 24dp.
  focusPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoAdvanceOverlay: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  autoAdvanceText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  autoAdvanceCancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  autoAdvanceCancelText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default BacePlayer;
