// VLCPlayerComponent.js (simplified)
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  View,
  Dimensions,
} from 'react-native';
import {VLCPlayer} from 'react-native-vlc-media-player';
import Icon from 'react-native-vector-icons/MaterialIcons';
import SkipIndicator from './SkipIndicator';
import PlayerSettings from './PlayerSettings';
import {updateItemFields} from '../../database/U';
import usePlayerTimeStore from './usePlayerTimeStore';
import SliderWithTime from './SliderWithTime';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DOUBLE_PRESS_DELAY = 300;
const playbackRates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

const VLCPlayerComponent = forwardRef(
  (
    {
      item,
      isAudio,
      onBack,
      onToggleSize,
      isMinimized,
      onCurrentTimeChange,
      onIsPausedChange,
      onPlayBackRateChange,
      pauseOnStart,
      startTime,
      onEnd,
    },
    ref,
  ) => {
    console.log(
      '🔄🔄🔄🔄 VLCPlayerComponent RENDERING',
      new Date().toISOString(),
    );

    useImperativeHandle(ref, () => ({
      handleSeek,
      getCurrentTime: () => currentTimeRef.current,
      getIsPaused: () => isPaused,
      togglePlayPause,
      getDuration: () => durationRef.current,
    }));

    // Zustand setters
    const setCurrentTime = usePlayerTimeStore(state => state.setCurrentTime);
    const setDuration = usePlayerTimeStore(state => state.setDuration);

    // Refs
    const vlcPlayerRef = useRef(null);
    const lastTap = useRef(0);
    const controlsTimeout = useRef(null);
    const durationRef = useRef(0);
    const currentTimeRef = useRef(0);

    // Local state (non-time related)
    const [isPaused, setIsPaused] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [playbackRateIndex, setPlaybackRateIndex] = useState(2);
    const [showSkipIndicator, setShowSkipIndicator] = useState(false);
    const [skipDirection, setSkipDirection] = useState(null);

    // Animations
    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const skipIndicatorOpacity = useRef(new Animated.Value(0)).current;

    const settingsRef = useRef();

    useEffect(() => {
      onPlayBackRateChange?.(
        settingsRef.current?.getPlaybackRate() ||
          playbackRates[playbackRateIndex],
      );
    }, [playbackRateIndex]);

    useEffect(() => {
      onIsPausedChange?.(isPaused);
    }, [isPaused]);

    // Auto-hide controls logic
    useEffect(() => {
      clearTimeout(controlsTimeout.current);
      if (!isPaused && !isAudio && controlsVisible) {
        controlsTimeout.current = setTimeout(hideControls, 3000);
      } else if (isAudio) {
        setControlsVisible(true);
      }
      return () => clearTimeout(controlsTimeout.current);
    }, [isPaused, controlsVisible, isAudio]);

    const hideControls = () => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    const showControls = () => {
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      if (!isPaused) {
        controlsTimeout.current = setTimeout(hideControls, 3000);
      }
    };

    const handleScreenTap = () => {
      if (isAudio) return;
      showControls();
      settingsRef.current?.closeSettingsModal?.();
    };

    const handleDoubleTap = useCallback(
      event => {
        const now = Date.now();
        const {locationX} = event.nativeEvent;
        if (lastTap.current && now - lastTap.current < DOUBLE_PRESS_DELAY) {
          const screenThird = SCREEN_WIDTH / 3;
          if (locationX < screenThird) {
            skipTime(-10);
            setSkipDirection('backward');
          } else if (locationX > screenThird * 2) {
            skipTime(10);
            setSkipDirection('forward');
          } else {
            togglePlayPause();
            return;
          }
          animateSkipIndicator();
          lastTap.current = 0;
        } else {
          lastTap.current = now;
        }
      },
      [skipTime, togglePlayPause],
    );

    const animateSkipIndicator = () => {
      setShowSkipIndicator(true);
      Animated.sequence([
        Animated.timing(skipIndicatorOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(skipIndicatorOpacity, {
          toValue: 0,
          duration: 500,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowSkipIndicator(false));
    };

    const skipTime = useCallback(
      seconds => {
        if (vlcPlayerRef.current && durationRef.current) {
          const newTime = Math.max(
            0,
            Math.min(
              currentTimeRef.current + seconds * 1000,
              durationRef.current,
            ),
          );
          vlcPlayerRef.current.seek(newTime / durationRef.current);
          setCurrentTime(newTime);
        }
      },
      [setCurrentTime],
    );

    const togglePlayPause = useCallback(() => {
      if (
        currentTimeRef.current >= durationRef.current &&
        durationRef.current > 0
      ) {
        handleReplay();
      } else {
        setIsPaused(prev => !prev);
      }
    }, []);

    const handleReplay = useCallback(() => {
      if (vlcPlayerRef.current) {
        setIsPaused(true);
        onEnd();
      }
    }, [onEnd]);

    const handleSeek = useCallback(
      newTime => {
        if (vlcPlayerRef.current && durationRef.current > 0) {
          const seekPosition = newTime / durationRef.current;
          vlcPlayerRef.current.seek(seekPosition);
          setCurrentTime(newTime);
        }
      },
      [setCurrentTime],
    );

    const changePlaybackRate = useCallback(() => {
      const newIndex = (playbackRateIndex + 1) % playbackRates.length;
      setPlaybackRateIndex(newIndex);
    }, [playbackRateIndex]);

    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleScreenTap}
        onPressOut={handleDoubleTap}
        style={styles.touchable}>
        {/* Header */}
        <Animated.View
          style={[styles.headerOverlay, {opacity: controlsOpacity}]}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {item?.title || 'Media Player'}
            </Text>
          </View>
        </Animated.View>

        {/* Player */}
        <VLCPlayer
          ref={vlcPlayerRef}
          source={{uri: item.file_path}}
          style={isAudio ? styles.audioPlayer : styles.videoPlayer}
          autoplay={true}
          paused={isPaused}
          onProgress={event => {
            setCurrentTime(event.currentTime);
            currentTimeRef.current = event.currentTime;
            onCurrentTimeChange?.(event.currentTime);
            if (event.duration > 0 && !durationRef.current) {
              pauseOnStart && setIsPaused(true);
              durationRef.current = event.duration;
              setDuration(event.duration);
              updateItemFields(item.id, {duration: event.duration / 1000});
            }
          }}
          onOpen={() => {
            if (item.duration > 0 && startTime) {
              vlcPlayerRef.current?.seek(startTime / item.duration);
            }
          }}
          playInBackground={true}
          videoAspectRatio={settingsRef.current?.getAspectRatio?.()}
          rate={
            settingsRef.current?.getPlaybackRate?.() ||
            playbackRates[playbackRateIndex]
          }
          repeat={true}
          onEnd={handleReplay}
        />

        {/* Play/Pause Overlay */}
        {controlsVisible && !isAudio && (
          <Animated.View
            style={[styles.overlayControls, {opacity: controlsOpacity}]}>
            <TouchableOpacity
              style={styles.playPauseButton}
              onPress={togglePlayPause}>
              <Icon
                name={isPaused ? 'play-arrow' : 'pause'}
                size={50}
                color="white"
              />
            </TouchableOpacity>
          </Animated.View>
        )}

        <SkipIndicator
          visible={showSkipIndicator}
          direction={skipDirection}
          opacity={skipIndicatorOpacity}
        />

        {/* Bottom Controls */}
        {controlsVisible && (
          <Animated.View
            style={[styles.bottomControls, {opacity: controlsOpacity}]}>
            {isAudio && (
              <View style={styles.audioButtonRow}>
                <TouchableOpacity
                  style={styles.audioControlButton}
                  onPress={() => skipTime(-10)}>
                  <Icon name="replay-10" size={30} color="white" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.audioMainButton}
                  onPress={togglePlayPause}>
                  <Icon
                    name={isPaused ? 'play-arrow' : 'pause'}
                    size={30}
                    color="white"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.audioControlButton}
                  onPress={() => skipTime(10)}>
                  <Icon name="forward-10" size={30} color="white" />
                </TouchableOpacity>
                
        
              </View>
            )}
            <View style={styles.bottomRow}>
              {/* Single component handles all time display and seeking */}
              <SliderWithTime
                style={styles.timeControlsContainer}
                sliderStyle={styles.sliderInline}
                onSeek={handleSeek}
              />

              {!isAudio ? (
                <View style={styles.inlineButtonRow}>
                  <PlayerSettings ref={settingsRef} />
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={onToggleSize}>
                    <Icon
                      name={isMinimized ? 'fullscreen' : 'fullscreen-exit'}
                      size={28}
                      color="white"
                    />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.audioControlButton}
                  onPress={changePlaybackRate}>
                  <Text style={styles.speedText}>
                    {playbackRates[playbackRateIndex]}x
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </TouchableOpacity>
    );
  },
);

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    justifyContent: 'center',
  },
  videoPlayer: {
    flex: 1,
    width: '100%',
  },
  audioPlayer: {
    height: 100,
    width: '100%',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: 10,
    paddingBottom: 5,
    paddingHorizontal: 15,
    zIndex: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
  },
  title: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  overlayControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playPauseButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 50,
    padding: 3,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    zIndex: 10,
    paddingBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  timeControlsContainer: {
    flex: 1,
  },
  sliderInline: {
    flex: 1,
    marginHorizontal: 8,
  },
  inlineButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  controlButton: {
    padding: 7,
  },
  audioButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  audioControlButton: {
    padding: 10,
    marginHorizontal: 15,
  },
  audioMainButton: {
    padding: 10,
    marginHorizontal: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 50,
  },
  speedText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default VLCPlayerComponent;
