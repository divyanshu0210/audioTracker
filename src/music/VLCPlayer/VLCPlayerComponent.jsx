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
import {usePipMode} from '../usePipMode';
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

    // In PiP the window is only big enough for the video itself, and Android
    // doesn't deliver touches to it anyway — every control here is dead weight.
    const {isInPip} = usePipMode();

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
    // Bumped to force-remount <VLCPlayer> after end-of-track — some builds
    // of the native player stop honoring seek() once a stream has reported
    // EOF (manual seeks silently no-op and playback snaps back to the end),
    // so recovering means creating a fresh native player instance instead.
    const [playerKey, setPlayerKey] = useState(0);
    const hasAppliedStartTimeRef = useRef(false);
    // Value for the *next* mount's `autoplay` prop only — read once at
    // construction time by the native player, then left alone. Must be a
    // ref, not state derived from isPaused: this native player treats every
    // `autoplay` prop change (even on an already-mounted instance) as
    // "reload and play from 0", which broke ordinary pause → resume.
    // Ongoing play/pause after mount goes entirely through `paused`.
    const autoplayOnMountRef = useRef(true);
    // Whether the *current* native instance has already reached EOF once.
    // Not derivable from currentTime >= duration — resetToStart zeroes
    // currentTime as soon as a track ends, so that comparison can't tell
    // "just ended, needs a remount to play again" apart from "paused at 0
    // mid-playback" on any *subsequent* end. Without this, pressing Play
    // after a track ends just flips `paused` on the already-ended instance
    // instead of remounting it — and this native player never fires onEnd
    // again for an instance that's resumed that way, so the second end of a
    // replayed track silently does nothing (no countdown, no autoplay).
    const hasEndedRef = useRef(false);

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

    // ─── Controls visibility ──────────────────────────────────────────────────
    const hideControls = useCallback(() => {
      // The 3s timer that schedules this can still be pending if the video
      // got paused after it was set (e.g. pauseOnStart pausing right after
      // the initial showControls() call) — don't hide while paused.
      if (isPaused) return;
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, [controlsOpacity, isPaused]);

    const showControls = useCallback(() => {
      setControlsVisible(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      clearTimeout(controlsTimeout.current);
      // Audio has no video content for controls to obstruct, and no tap
      // handler to bring them back (handleScreenTap no-ops for audio) — they
      // should just stay up permanently, never auto-hide.
      if (!isPaused && !isAudio) {
        controlsTimeout.current = setTimeout(hideControls, 3000);
      }
    }, [controlsOpacity, hideControls, isPaused, isAudio]);

    // Show controls on mount via showControls() (not a bare
    // setControlsVisible(true)) so the initial display also schedules the
    // 3s auto-hide for video — otherwise, until the user taps the screen
    // once, nothing ever starts that timer and controls stay visible
    // indefinitely. showControls itself skips scheduling that hide for audio.
    useEffect(() => {
      showControls();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleScreenTap = useCallback(() => {
      if (isAudio) return;
      showControls();
      settingsRef.current?.closeSettingsModal?.();
    }, [isAudio, showControls]);

    // Reset to 0, called both when the track actually ends (stay paused —
    // "replay" state) and when the user presses Play after it ended (resume
    // playing from 0). Those two need different `paused` outcomes, so the
    // caller decides via `play`; don't hardcode it here.
    const resetToStart = useCallback(
      play => {
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setIsPaused(!play);
        autoplayOnMountRef.current = play;
        // This remount produces a fresh, not-yet-ended instance — handleReplay
        // re-marks it ended immediately after, for the native-onEnd case.
        hasEndedRef.current = false;
        setPlayerKey(k => k + 1);
        // Video controls auto-hide after a few seconds of inactivity, and
        // nothing else re-shows them when a track ends — without this, the
        // player can sit there paused at 0 with no visible way to replay.
        clearTimeout(controlsTimeout.current);
        controlsOpacity.setValue(1);
        setControlsVisible(true);
      },
      [setCurrentTime, setControlsVisible, controlsOpacity],
    );

    const handleReplay = useCallback(() => {
      resetToStart(false);
      hasEndedRef.current = true;
      onEnd?.();
    }, [resetToStart, onEnd]);

    const togglePlayPause = useCallback(() => {
      if (hasEndedRef.current) {
        // Ended — Play must remount (see hasEndedRef/resetToStart) rather
        // than just flip `paused` on the already-ended instance.
        resetToStart(true);
      } else {
        setIsPaused(!isPaused);
      }
    }, [resetToStart, isPaused]);

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
          style={[
            styles.headerOverlay,
            {opacity: controlsOpacity},
            isInPip && styles.hiddenInPip,
          ]}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Icon name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>
              {item?.title || 'Media Player'}
            </Text>
          </View>
        </Animated.View>

        {/* VLCPlayer — re-renders only when isPaused or playbackRateIndex change.
            key={playerKey} lets resetToStart force a fresh native instance
            after end-of-track, since seek() stops working once the stream
            has reported EOF. */}
        <VLCPlayer
          key={playerKey}
          ref={vlcPlayerRef}
          source={{uri: item.file_path}}
          style={isAudio ? styles.audioPlayer : styles.videoPlayer}
          autoplay={autoplayOnMountRef.current}
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
            // Only honor startTime on the very first open — reapplying it on
            // every resetToStart remount would seek back to the old saved
            // position instead of the fresh 0 we just reset to.
            if (!hasAppliedStartTimeRef.current && item.duration > 0 && startTime) {
              vlcPlayerRef.current?.seek(startTime / item.duration);
            }
            hasAppliedStartTimeRef.current = true;
          }}
          playInBackground={true}
          videoAspectRatio={settingsRef.current?.getAspectRatio?.()}
          rate={
            settingsRef.current?.getPlaybackRate?.() ??
            playbackRates[playbackRateIndex]
          }
          // The app drives its own end-of-track behavior via handleReplay/onEnd
          // (pause-and-offer-replay, or advance to the next playlist item) —
          // native repeat would auto-restart playback underneath that,
          // fighting with the explicit pause and leaving the player in an
          // inconsistent state where a manual seek back to 0 stops working.
          repeat={false}
          onEnd={handleReplay}
        />

        {/* Each child below re-renders independently via its own store subscription */}
        {!isInPip && (
          <PlayPauseOverlay
            controlsOpacity={controlsOpacity}
            onTogglePlayPause={togglePlayPause}
            isAudio={isAudio}
            isPaused={isPaused}
          />
        )}

        {!isInPip && <SkipIndicator />}

        {!isInPip && <BottomControls
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
        />}
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
  hiddenInPip: {display: 'none'},
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
