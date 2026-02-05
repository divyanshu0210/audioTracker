import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
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
import BottomMenu from '../components/bottomsheets/BottomMenu';
import {handleExport} from '../components/menu/NoteMenuItems';
import {useAppState} from '../contexts/AppStateContext';
import {
  fetchLatestWatchData,
  fetchLatestWatchDataAllFields,
} from '../database/R';
import RichTextEditor from '../notes/richEditor/RichTextEditor';
import VideoTracker from './videoTracker';
import useSettingsStore from '../Settings/settingsStore';
import VLCPlayerComponent from './VLCPlayer/VLCPlayerComponent';
import YouTubePlayerComponent from './VLCPlayer/YouTubePlayerComponent ';
import AddNewNoteBtn from '../components/buttons/AddNewNoteBtn';
import {
  prepareVideoReportPayload,
  saveDatatoBackend,
} from '../appMentorBackend/reportMgt';
// const {PipModule} = NativeModules;

const isAudioFile = fileName => {
  const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];
  const fileExtension = fileName?.split('.').pop()?.toLowerCase() || '';
  return audioExtensions.includes(fileExtension);
};

const BacePlayer = () => {
  const navigation = useNavigation();
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
  const bottomSheetRef = useRef(null);
  const tracker = useRef(null);
  const playerRef = useRef(null);

  const [isPaused, setIsPaused] = useState(pauseOnStart ?? false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [lastTime, setLastTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const durationRef = useRef(0);

  const [isAudio, setIsAudio] = useState(false);
  const AUDIO_PLAYER_HEIGHT = 140;
  const {height: SCREEN_HEIGHT} = Dimensions.get('window');
  const MAXIMIZED_HEIGHT = SCREEN_HEIGHT;
  const MINIMIZED_HEIGHT = useRef(
    new Animated.Value(SCREEN_HEIGHT * 0.25),
  ).current;
  // Animations
  const playerHeight = useRef(
    new Animated.Value(MINIMIZED_HEIGHT._value),
  ).current;
  const pan = useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isHidden, setIsHidden] = useState(false);

  // Notes context
  const [showNotes, setShowNotes] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const {activeNoteId, setActiveNoteId, setNotesList, setActiveItem} =
    useAppState();

  // Helper function to get item properties
  const getItemProperties = item => {
    const TIME_FACTOR = item?.driveId ? 1000 : 1;
    const source_type = item?.driveId
      ? item.source_type === 'device'
        ? 'device'
        : 'drive'
      : 'youtube';
    const videoId = item?.driveId ? item.driveId : item?.ytube_id;
    // setActiveItem(item);
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
      console.log('vlc ', currentItem);
      setNotesList([]);
      const tempIsAudio =
        source_type !== 'youtube' && isAudioFile(currentItem?.name);
      setIsAudio(tempIsAudio);

      if (tempIsAudio) {
        // For audio items
        MINIMIZED_HEIGHT.setValue(AUDIO_PLAYER_HEIGHT);
        if (isMinimized) {
          playerHeight.setValue(AUDIO_PLAYER_HEIGHT);
        }
      } else {
        // For video items
        MINIMIZED_HEIGHT.setValue(SCREEN_HEIGHT * 0.25);
        if (isMinimized) {
          playerHeight.setValue(SCREEN_HEIGHT * 0.25);
        }
      }

      loadPreviousWatchData(videoId);
    }

    if (route.params?.currentNoteId) {
      setActiveNoteId(route.params?.currentNoteId);
      setShowNotes(true);
      hidePlayer();
    }

    navigation.setOptions({headerShown: false});
    navigation.getParent()?.setOptions({tabBarStyle: {display: 'none'}});
    return () => {
      navigation.setOptions({headerShown: true});
      navigation.getParent()?.setOptions({tabBarStyle: {display: 'flex'}});
      cleanupPlayer();
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
    if (activeNoteId != null) {
      // pauseOnStart && hidePlayer();
      setShowNotes(true);
      bottomSheetRef.current?.close();
      console.log('activeNoteId updated:', activeNoteId);
    }
  }, [activeNoteId]);

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

  const cleanupPlayer = async () => {
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
  };

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


  // Handle time tracking
  useEffect(() => {
    if (!tracker.current) return; // Only run if tracker is initialized

    console.log(
      'video logs',
      currentTime / TIME_FACTOR,
      playbackSpeed,
      isPaused,
    );

    if (
      Math.abs(currentTime - lastTime) /
        (TIME_FACTOR * (source_type !== 'youtube' ? 1 : playbackSpeed)) >
      9
    ) {
      console.log(
        'video skipped',
        lastTime / TIME_FACTOR,
        currentTime / TIME_FACTOR,
      );
      tracker.current?.onPause(lastTime / TIME_FACTOR);
      console.log('Intervals', tracker.current?.getIntervals());
      tracker.current?.onPlay(currentTime / TIME_FACTOR);
    }

    setLastTime(currentTime);
    currentTimeRef.current = currentTime;
  }, [currentTime, playbackSpeed, tracker.current]);

  // Handle play/pause tracking
  useEffect(() => {
    if (!tracker.current) return; // Only run if tracker is initialized

    console.log(
      'video logs on Play/pause',
      currentTime / TIME_FACTOR,
      playbackSpeed,
      isPaused,
    );

    isPaused
      ? tracker.current?.onPause(currentTime / TIME_FACTOR)
      : tracker.current?.onPlay(currentTime / TIME_FACTOR);
    console.log('Intervals', tracker.current?.getIntervals());
  }, [isPaused, tracker.current]);

  useEffect(() => {
    if (playerRef.current) {
      durationRef.current = playerRef.current.getDuration();
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
      setCurrentTime(0);
      setLastTime(0);
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
      setCurrentTime(0);
      setLastTime(0);
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

  const handleOpenBottomMenu = useCallback(() => {
    Keyboard.dismiss();
    const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
      bottomSheetRef.current?.snapToIndex(0);
      keyboardHideListener.remove();
    });

    setTimeout(() => {
      keyboardHideListener.remove();
      bottomSheetRef.current?.snapToIndex(0);
    }, 300);
  }, [bottomSheetRef]);

  const handleBackPress = useCallback(() => {
    setActiveItem(null);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
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
  }, [navigation]);

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
          setIsDragging(true);
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
        }).start(() => setIsDragging(false));
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
              handleExport(activeNoteId, 'pdf');
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
              {source_type === 'youtube' && isDataLoaded ? (
                <YouTubePlayerComponent
                  ref={playerRef}
                  item={currentItem}
                  notesSectionRef={notesSectionRef}
                  onBack={handleBackPress}
                  onCurrentTimeChange={setCurrentTime}
                  onIsPausedChange={setIsPaused}
                  onPlayBackRateChange={setPlaybackSpeed}
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
                    onCurrentTimeChange={setCurrentTime}
                    onIsPausedChange={setIsPaused}
                    onPlayBackRateChange={setPlaybackSpeed}
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
                  !isMinimized && currentItem.driveId && togglePlayerSize();
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
              />
            </View>
          </Animated.View>

          {renderPersistentBackButton()}
          {renderDragHandle()}

          {showNotes && (
            <View style={{flex: 1, marginTop: isHidden ? 5 : 50}}>
              <RichTextEditor
                ref={notesSectionRef}
                noteId={activeNoteId}
                key={activeNoteId || 'new-note'}
                captureScreenshot={
                  source_type === 'youtube'
                    ? playerRef.current?.captureScreenshot
                    : captureVLCScreenshot
                }
                showPlayerMinimized={showPlayerMinimized}
                playerRef={playerRef}
                {...(source_type === 'youtube'
                  ? {
                      webViewRef: playerRef.current?.webViewRef,
                      ytTime: playerRef.current?.getCurrentTime(),
                    }
                  : {
                      vlcTime: playerRef.current?.getCurrentTime() / 1000,
                      seekToTime: time => playerRef.current?.handleSeek(time),
                    })}
                isHidden={isHidden}
              />
            </View>
          )}

          <BottomMenu ref={bottomSheetRef} />
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
