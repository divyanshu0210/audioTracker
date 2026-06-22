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
import {saveDatatoBackend} from '../appMentorBackend/reportMgt';
import {useNotesStore} from '../stores/useNotesStore';
import {useShallow} from 'zustand/react/shallow';
import {useSelectionStore} from '../stores/useSelectionStore';
import { navigationRef } from '../handlers/navigationRef';
import {
  activateKeepAwake,
  deactivateKeepAwake,
} from '@sayem314/react-native-keep-awake';
// const {PipModule} = NativeModules;

const isAudioFile = mimeType => {
  return mimeType.startsWith('audio/');
};

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
      setNotesList([]);
      setActiveItem({
        sourceId: currentItem.source_id,
        sourceType: currentItem.type,
        item: currentItem,
      });
      const tempIsAudio =
        source_type !== 'youtube_video' && isAudioFile(currentItem?.mimeType);
      setIsAudio(tempIsAudio);

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
      await saveDatatoBackend(currentItem);
    } else {
      console.log('Tracker not initialized, skipping save.');
    }
  }, [currentItem, TIME_FACTOR]);

  useEffect(() => {
    const handleAppStateChange = async nextAppState => {
      if (nextAppState !== 'active' && appState.current === 'active') {
        // App is moving from foreground to background/inactive
        console.log('App is no longer active. Running function...');
        await cleanupPlayer();
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
    [tracker, TIME_FACTOR],
  );

  const handlePlaybackRateChange = useCallback(speed => {
    playbackSpeedRef.current = speed;
  }, []);

  const updateDuration = useCallback(async (duration) => {
    if (playerRef.current) {
      durationRef.current = duration;
    }
  }, [playerRef.current]);

  // Handle playlist navigation
  const handleNext = async () => {
    if (!autoplay) return;

    if (currentIndex < playlist.length - 1) {
      await cleanupPlayer();
      setActiveNoteId(null);
      setCurrentIndex(currentIndex + 1);
      setIsDataLoaded(false);
      currentTimeRef.current = 0; 
      lastTimeRef.current = 0; 
      setShowNotes(false);
      setIsMinimized(true);
    }
  };

  const handlePrevious = async () => {
    if (!autoplay) return;

    if (currentIndex > 0) {
      await cleanupPlayer();
      setActiveNoteId(null);
      setCurrentIndex(currentIndex - 1);
      setIsDataLoaded(false);
      currentTimeRef.current = 0; 
      lastTimeRef.current = 0;
      setShowNotes(false);
      setIsMinimized(true);
    }
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

  const renderPlaylistControls = () => {
    if (playlist.length <= 1 || !autoplay) return null;

    return (
      <View style={styles.playlistControls}>
        <TouchableOpacity
          onPress={handlePrevious}
          disabled={currentIndex === 0}
          style={[
            styles.playlistButton,
            currentIndex === 0 && styles.disabledButton,
          ]}>
          <Icon
            name="skip-previous"
            size={30}
            color={currentIndex === 0 ? '#ccc' : '#555'}
          />
        </TouchableOpacity>

        <Text style={styles.playlistText}>
          {currentIndex + 1} / {playlist.length}
        </Text>

        <TouchableOpacity
          onPress={handleNext}
          disabled={currentIndex === playlist.length - 1}
          style={[
            styles.playlistButton,
            currentIndex === playlist.length - 1 && styles.disabledButton,
          ]}>
          <Icon
            name="skip-next"
            size={30}
            color={currentIndex === playlist.length - 1 ? '#ccc' : '#555'}
          />
        </TouchableOpacity>
      </View>
    );
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
            ]}>
            <ViewShot
              ref={captureRef}
              options={{format: 'jpg', quality: 0.9, result: 'base64'}}
              style={[styles.viewShot, isHidden && {opacity: 0, height: 0}]}>
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
                  onEnd={handleNext}
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
                    onEnd={handleNext}
                  />
                )
              )}
            </ViewShot>

            {!showNotes && renderPlaylistControls()}

            <View style={styles.btnContainer}>
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

          {renderPersistentBackButton()}
          {renderDragHandle()}

          {showNotes && (
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
  playlistControls: {
    // position: 'absolute',
    // bottom: 60,
    // left: 0,
    // right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    // paddingVertical: 10,
  },
  playlistButton: {
    marginHorizontal: 20,
    padding: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  playlistText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default BacePlayer;
