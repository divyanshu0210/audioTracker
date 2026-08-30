import { useRoute} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  InteractionManager,
  Keyboard,
  NativeModules,
  PanResponder,
  StyleSheet,
  Text,
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
// const {PipModule} = NativeModules;

const isAudioFile = mimeType => {
  return mimeType.startsWith('audio/');
};

// How much media time may sit unsaved before we force a write. Progress only
// reaches the DB when an interval closes, so without this a process death
// mid-session loses the *entire* session rather than a trailing few seconds.
const PROGRESS_CHECKPOINT_SECONDS = 120;

const NoteSection = React.memo(
  ({editorRef, source_type, playerRef, captureVLCScreenshot, showPlayerMinimized, isHidden}) => {
    const activeNoteId = useNotesStore(state => state.activeNoteId);
    console.log('🔄 NoteSection RENDERING', new Date().toISOString());
    return (
      <View style={{flex: 1, marginTop: isHidden ? 5 : 50}}>
        <RichTextEditor
          ref={editorRef}
          noteId={activeNoteId}
          key={activeNoteId || 'new-note'}
          captureScreenshot={
            source_type === 'youtube_video'
              ? playerRef.current?.captureScreenshot
              : captureVLCScreenshot
          }
          showPlayerMinimized={showPlayerMinimized}
          playerRef={playerRef}
          source_type={source_type}
          webViewRef={source_type === 'youtube_video' ? playerRef.current?.webViewRef : null}
          isHidden={isHidden}
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

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Playlist state
  const [playlist, setPlaylist] = useState(routeItems || (item ? [item] : []));
  const [currentIndex, setCurrentIndex] = useState(routeCurrentIndex || 0);
  const currentItem = playlist[currentIndex] || null;
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
    const shouldHold =
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
  }, [currentItem]);

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
  }, []);

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
      // anywhere else backgrounds the app normally.
      armPip(!paused && isVideoRef.current);

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
    [tracker, TIME_FACTOR, armPip, reconcileKeepAlive],
  );

  const handlePlaybackRateChange = useCallback(speed => {
    playbackSpeedRef.current = speed;
  }, []);

  const updateDuration = useCallback(async (duration) => {
    if (playerRef.current) {
      durationRef.current = duration;
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
              {source_type === 'youtube_video' && isDataLoaded ? (
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
              ) : (
                currentItem.file_path &&
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
                  />
                )
              )}
            </ViewShot>

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
              <TouchableOpacity
                style={styles.addButton}
                disabled={isCreatingNote}
                onPress={handleOpenBottomMenu}>
                <Text style={styles.name}>All Notes</Text>
              </TouchableOpacity>

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
                    !currentItem?.type.startsWith('youtube') &&
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
            />
          )}
        </>
      ) : (
        <Text>Loading...</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
