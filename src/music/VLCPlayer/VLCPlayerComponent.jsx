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
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/MaterialIcons';
import SkipIndicator from './SkipIndicator';
import PlayerSettings from './PlayerSettings';
import {updateDurationIfNotSet} from '../../database/U';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const DOUBLE_PRESS_DELAY = 300;

const formatTime = time => {
  if (!time || isNaN(time)) return '00:00';
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
};
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
      onEnd
    },
    ref,
  ) => {
    // Forward exposed methods
    useImperativeHandle(ref, () => ({
      handleSeek,
      getCurrentTime: () => currentTime,
      getIsPaused: () => isPaused,
      togglePlayPause,
      getDuration: () => durationRef.current,
    }));

    // Refs
    const vlcPlayerRef = useRef(null);
    const lastTap = useRef(0);
    const controlsTimeout = useRef(null);
    const durationRef = useRef(0);

    // Player state
    const [isPaused, setIsPaused] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const currentTimeRef = useRef(currentTime);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [playbackRateIndex, setPlaybackRateIndex] = useState(2); // Default to 1.0

    // UI state
    const [showSkipIndicator, setShowSkipIndicator] = useState(false);
    const [skipDirection, setSkipDirection] = useState(null);

    // Animations
    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const skipIndicatorOpacity = useRef(new Animated.Value(0)).current;

    const settingsRef = useRef();

    useEffect(() => {
      currentTimeRef.current = currentTime;
      if (onCurrentTimeChange) {
        onCurrentTimeChange(currentTime);
        onPlayBackRateChange(settingsRef.current?.getPlaybackRate() || playbackRates[playbackRateIndex]);
      }
    }, [currentTime,playbackRateIndex]);

    useEffect(() => {
      if (onIsPausedChange) {
        onIsPausedChange(isPaused);
      }
    }, [isPaused]);

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

    const skipTime = useCallback(seconds => {
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
    }, []);

    const togglePlayPause = useCallback(() => {
      if (currentTime >= durationRef.current && durationRef.current > 0) {
        handleReplay();
      } else {
        setIsPaused(prev => !prev);
      }
    }, [currentTime]);

    const handleReplay = useCallback(() => {
      if (vlcPlayerRef.current) {
        // setCurrentTime(0);
        // vlcPlayerRef.current.seek(0);
        setIsPaused(true);
        onEnd();
      }
    }, []);

    const handleSeek = useCallback(newTime => {
      if (vlcPlayerRef.current && durationRef.current > 0) {
        const seekPosition = newTime / durationRef.current;
        vlcPlayerRef.current.seek(seekPosition);
        setCurrentTime(newTime);
      }
    }, []);

    const changePlaybackRate = useCallback(() => {
      const newIndex = (playbackRateIndex + 1) % playbackRates.length;
      setPlaybackRateIndex(newIndex);
    }, [playbackRateIndex]);

    function getDrivePreviewLink(fileId) {
      return `https://drive.google.com/uc?export=preview&id=${fileId}`;
    }
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleScreenTap}
        onPressOut={handleDoubleTap}
        style={styles.touchable}>
        {/* Header Overlay */}
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
            if (event.duration > 0 && !durationRef.current) {
              pauseOnStart&&setIsPaused(true); //this happens on first time play // so if pauseOnStart then turn pause true from here. 
              durationRef.current = event.duration;
              updateDurationIfNotSet({
                sourceType: item.type,
                id: item.source_id, 
                duration: event.duration / 1000,
              });
            }
          }}
          onOpen={() => {
            if (item.duration > 0 && startTime) {
              vlcPlayerRef.current?.seek(startTime / item.duration);
            }
          }}
          playInBackground={true}
          videoAspectRatio={settingsRef.current?.getAspectRatio?.()}
          rate={settingsRef.current?.getPlaybackRate?.() || playbackRates[playbackRateIndex]}
          repeat ={true}
          onEnd={handleReplay}
        />

        {/* Play/Pause Button Overlay */}
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

        {/* Bottom Controls Overlay */}
        {controlsVisible && (
          <Animated.View
            style={[styles.bottomControls, {opacity: controlsOpacity}]}>
                     {isAudio &&(
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
           
              <Text style={styles.timeText}>
                {formatTime(currentTime / 1000)}
              </Text>

              <Slider
                style={styles.sliderInline}
                value={currentTime}
                minimumValue={0}
                maximumValue={durationRef.current}
                onSlidingComplete={handleSeek}
                minimumTrackTintColor="red"
                maximumTrackTintColor="rgba(255, 255, 255, 0.5)"
                thumbTintColor="red"
              />

              <Text style={styles.timeText}>
                {formatTime(durationRef.current / 1000)}
              </Text>

       

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
              ):(
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

//   export default VLCPlayerComponent;

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
  },
  sliderInline: {
    flex: 1,
  },
  inlineButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  timeText: {
    color: 'white',
    fontSize: 12,
    width: 50,
    textAlign: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlButton: {
    padding: 7,
  },

  // Audio-specific styles
  audioControls: {
    width: '100%',
  },
  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
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
    // minWidth: 50,
    textAlign: 'center',
  },
});

export default VLCPlayerComponent;
