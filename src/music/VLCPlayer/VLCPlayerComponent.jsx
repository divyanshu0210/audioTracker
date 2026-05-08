// VLCPlayerComponent.jsx

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {StyleSheet, Text, TouchableOpacity, Animated, View} from 'react-native';
import {VLCPlayer} from 'react-native-vlc-media-player';
import Icon from 'react-native-vector-icons/MaterialIcons';
import SkipHandler from './SkipHandler';
import SkipIndicator from './SkipIndicator';
import PlayPauseOverlay from './PlayPauseOverlay';
import PlayerSettings from './PlayerSettings';
import SliderWithTime from './SliderWithTime';
import {updateItemFields} from '../../database/U';
import usePlayerTimeStore from './usePlayerTimeStore';
import {useShallow} from 'zustand/react/shallow';

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
      updateDuration,
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

    console.log('startFrom', startTime);

    const {
      setCurrentTime,
      setDuration,
      setControlsVisible,
      getCurrentTime,
      getDuration,
    } = usePlayerTimeStore(
      useShallow(state => ({
        setCurrentTime: state.setCurrentTime,
        setDuration: state.setDuration,
        setControlsVisible: state.setControlsVisible,
        getCurrentTime: state.getCurrentTime,
        getDuration: state.getDuration,
      })),
    );

    // ─── Imperative API ───────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        handleSeek,
        getCurrentTime: () => currentTimeRef.current,
        getIsPaused: () => isPaused,
        togglePlayPause,
        getDuration: () => durationRef.current,
      }),
      [handleSeek, togglePlayPause],
    );

    // ─── Refs ─────────────────────────────────────────────────────────────────
    const vlcPlayerRef = useRef(null);
    const controlsTimeout = useRef(null);
    const durationRef = useRef(0);
    const currentTimeRef = useRef(0);
    const settingsRef = useRef();

    // ─── Animations ───────────────────────────────────────────────────────────
    const controlsOpacity = useRef(new Animated.Value(1)).current;

    // ─── Minimal local state ──────────────────────────────────────────────────
    // Only playbackRateIndex remains local — it must re-render VLCPlayer to
    // apply the new `rate` prop.
    const [playbackRateIndex, setPlaybackRateIndex] = useState(2);
    const [isPaused, setIsPaused] = useState(false);

    // ─── Side-effects ─────────────────────────────────────────────────────────
    useEffect(() => {
      onIsPausedChange?.(isPaused);
    }, [isPaused, onIsPausedChange]);

    useEffect(() => {
      onPlayBackRateChange?.(
        settingsRef.current?.getPlaybackRate() ??
          playbackRates[playbackRateIndex],
      );
    }, [playbackRateIndex, onPlayBackRateChange]);

    useEffect(() => {
      setControlsVisible(true);
    }, []);

    // ─── Controls visibility ──────────────────────────────────────────────────
    const hideControls = useCallback(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, [controlsOpacity]);

    const showControls = useCallback(() => {
      setControlsVisible(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      clearTimeout(controlsTimeout.current);
      if (!isPaused) {
        controlsTimeout.current = setTimeout(hideControls, 3000);
      }
    }, [controlsOpacity, hideControls, isPaused]);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleScreenTap = useCallback(() => {
      if (isAudio) return;
      showControls();
      settingsRef.current?.closeSettingsModal?.();
    }, [isAudio, showControls]);

    const handleReplay = useCallback(() => {
      if (vlcPlayerRef.current) {
        setIsPaused(true);
        onEnd?.();
      }
    }, [onEnd]);

    const togglePlayPause = useCallback(() => {
      if (getCurrentTime() >= getDuration() && getDuration() > 0) {
        handleReplay();
      } else {
        setIsPaused(!isPaused);
      }
    }, [handleReplay, isPaused]);

    const handleSeek = useCallback(newTime => {
      if (vlcPlayerRef.current && durationRef.current > 0) {
        vlcPlayerRef.current.seek(newTime / durationRef.current);
        setCurrentTime(newTime);
      }
    }, []);

    const skipTime = useCallback(seconds => {
      if (!vlcPlayerRef.current || !durationRef.current) return;
      const newTime = Math.max(
        0,
        Math.min(getCurrentTime() + seconds * 1000, getDuration()),
      );
      vlcPlayerRef.current.seek(newTime / durationRef.current);
      setCurrentTime(newTime);
    }, []);

    const changePlaybackRate = useCallback(() => {
      setPlaybackRateIndex(prev => (prev + 1) % playbackRates.length);
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
      <SkipHandler
        vlcPlayerRef={vlcPlayerRef}
        onSingleTap={handleScreenTap}
        onCenterDoubleTap={togglePlayPause}>
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

        {/* VLCPlayer — re-renders only when isPaused or playbackRateIndex change */}
        <VLCPlayer
          ref={vlcPlayerRef}
          source={{uri: item.file_path}}
          style={isAudio ? styles.audioPlayer : styles.videoPlayer}
          autoplay={true}
          paused={isPaused}
          onProgress={event => {
            if (event.duration > 0 && !durationRef.current) {
              pauseOnStart && setIsPaused(true);
              durationRef.current = event.duration;
              console.log('updating duration', durationRef.current);
              updateDuration(event.duration / 1000);
              updateItemFields(item.id, {duration: event.duration / 1000});
              setDuration(event.duration);
            }
            setCurrentTime(event.currentTime);
            currentTimeRef.current = event.currentTime;
            onCurrentTimeChange?.(event.currentTime);
          }}
          onOpen={() => {
            if (item.duration > 0 && startTime) {
              vlcPlayerRef.current?.seek(startTime / item.duration);
            }
          }}
          playInBackground={true}
          videoAspectRatio={settingsRef.current?.getAspectRatio?.()}
          rate={
            settingsRef.current?.getPlaybackRate?.() ??
            playbackRates[playbackRateIndex]
          }
          repeat={true}
          onEnd={handleReplay}
        />

        {/* Each child below re-renders independently via its own store subscription */}
        <PlayPauseOverlay
          controlsOpacity={controlsOpacity}
          onTogglePlayPause={togglePlayPause}
          isAudio={isAudio}
          isPaused={isPaused}
        />

        <SkipIndicator />

        <BottomControls
          controlsOpacity={controlsOpacity}
          isAudio={isAudio}
          isMinimized={isMinimized}
          onToggleSize={onToggleSize}
          onSeek={handleSeek}
          onSkip={skipTime}
          onTogglePlayPause={togglePlayPause}
          onChangePlaybackRate={changePlaybackRate}
          playbackRateIndex={playbackRateIndex}
          settingsRef={settingsRef}
          isPaused={isPaused}
        />
      </SkipHandler>
    );
  },
);

// ─── BottomControls ───────────────────────────────────────────────────────────
// Subscribes to controlsVisible + isPaused independently.
const BottomControls = React.memo(
  ({
    controlsOpacity,
    isAudio,
    isMinimized,
    onToggleSize,
    onSeek,
    onSkip,
    onTogglePlayPause,
    onChangePlaybackRate,
    playbackRateIndex,
    settingsRef,
    isPaused,
  }) => {
    const controlsVisible = usePlayerTimeStore(state => state.controlsVisible);

    if (!controlsVisible) return null;

    return (
      <Animated.View
        style={[styles.bottomControls, {opacity: controlsOpacity}]}>
        {isAudio && (
          <View style={styles.audioButtonRow}>
            <TouchableOpacity
              style={styles.audioControlButton}
              onPress={() => onSkip(-10)}>
              <Icon name="replay-10" size={30} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.audioMainButton}
              onPress={onTogglePlayPause}>
              <Icon
                name={isPaused ? 'play-arrow' : 'pause'}
                size={30}
                color="white"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.audioControlButton}
              onPress={() => onSkip(10)}>
              <Icon name="forward-10" size={30} color="white" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomRow}>
          <SliderWithTime
            style={styles.timeControlsContainer}
            sliderStyle={styles.sliderInline}
            onSeek={onSeek}
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
              onPress={onChangePlaybackRate}>
              <Text style={styles.speedText}>
                {playbackRates[playbackRateIndex]}x
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  },
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  videoPlayer: {flex: 1, width: '100%'},
  audioPlayer: {height: 100, width: '100%'},
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
  headerContent: {flexDirection: 'row', alignItems: 'center'},
  backButton: {marginRight: 15},
  title: {color: 'white', fontSize: 16, fontWeight: '500', flex: 1},
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
  timeControlsContainer: {flex: 1},
  sliderInline: {flex: 1, marginHorizontal: 8},
  inlineButtonRow: {flexDirection: 'row', alignItems: 'center', marginLeft: 8},
  controlButton: {padding: 7},
  audioButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  audioControlButton: {padding: 10, marginHorizontal: 15},
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

export default React.memo(VLCPlayerComponent);
