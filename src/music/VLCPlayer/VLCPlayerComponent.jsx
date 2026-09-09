// VLCPlayerComponent.jsx

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
      setIsBuffering,
      getIsBuffering,
      getCurrentTime,
      getDuration,
    } = usePlayerTimeStore(
      useShallow(state => ({
        setCurrentTime: state.setCurrentTime,
        setDuration: state.setDuration,
        setControlsVisible: state.setControlsVisible,
        setIsBuffering: state.setIsBuffering,
        getIsBuffering: state.getIsBuffering,
        getCurrentTime: state.getCurrentTime,
        getDuration: state.getDuration,
      })),
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

    // Whether the clock has ever moved for this source. libVLC reports
    // Buffering(100) and then Playing well before it has actually filled, and
    // goes straight back to buffering afterwards — trusting either one on its
    // own flashed the controls up mid-open (spinner, pause button, spinner,
    // picture). Until time is genuinely on the clock, those two are ignored.
    //
    // A ref: nothing renders from it, it only decides whether those early
    // claims can be believed. As state it would have re-rendered this whole
    // component — <VLCPlayer> included — four times a second.
    const hasStartedRef = useRef(false);

    // Aspect ratio and "is the settings panel open" live here, not inside
    // PlayerSettings. That component is rendered by BottomControls, which
    // returns null the moment the controls auto-hide — so its local state went
    // with it and a chosen ratio survived about three seconds. Worse, the
    // unmount nulled settingsRef, and videoAspectRatio was read off that ref
    // during render: every re-render after a hide (pausing being the obvious
    // one) swapped the value between the choice and undefined, and the picture
    // changed shape underneath the user.
    //
    // null means "whatever the file says". Nothing should impose a ratio the
    // user never asked for, which is what defaulting to 9:16 was doing.
    // Aspect ratio has to be state — it is a prop on <VLCPlayer>, so applying
    // it *is* a re-render, exactly like playbackRateIndex above. It changes
    // only when the user picks one.
    const [aspectRatio, setAspectRatio] = useState(null);
    // Whether the settings panel is open. A ref, not state: nothing in the
    // output depends on it, only the auto-hide timer does.
    const settingsOpenRef = useRef(false);

    // ─── Side-effects ─────────────────────────────────────────────────────────
    useEffect(() => {
      onIsPausedChange?.(isPaused);
    }, [isPaused, onIsPausedChange]);

    // A new source, or a fresh native instance, starts empty again. Without
    // this the spinner would stay hidden through the wait for the next track
    // in a queue, which is the same wait it exists to explain.
    useEffect(() => {
      hasStartedRef.current = false;
      setIsBuffering(true);
    }, [item?.file_path, playerKey, setIsBuffering]);

    // A different track inherits nothing from the last one.
    //
    // Two separate leaks were showing here. The store is global and
    // SliderWithTime reads currentTime/duration straight out of it, so until
    // the new source's first progress event the scrubber sat at the previous
    // video's position. And durationRef is a ref in a component BacePlayer
    // does *not* remount between tracks — it swaps the item prop in place — so
    // the `!durationRef.current` guard in onProgress stayed false and the new
    // track's real duration was never recorded at all.
    //
    // Keyed on source_id, not file_path or playerKey: resetToStart bumps
    // playerKey deliberately, and re-arming hasAppliedStartTimeRef there would
    // seek a replayed track back to its old saved position instead of the 0 it
    // was just reset to.
    useEffect(() => {
      setCurrentTime(0);
      setDuration(0);
      durationRef.current = 0;
      currentTimeRef.current = 0;
      hasAppliedStartTimeRef.current = false;
      hasEndedRef.current = false;
    }, [item?.source_id, setCurrentTime, setDuration]);

    // libVLC reports its fill level 0→100 while buffering, and again from 0 on
    // a mid-playback stall. onPlaying is the backstop: whatever the last fill
    // event claimed, media that has actually started is not buffering.
    const handleBuffering = useCallback(
      event => {
        const filling = (event?.bufferRate ?? 100) < 100;
        // "Done" is only credible once something has actually played; before
        // that it is the premature report described above.
        if (!filling && !hasStartedRef.current) return;
        setIsBuffering(filling);
      },
      [setIsBuffering],
    );

    const handlePlaying = useCallback(() => {
      if (hasStartedRef.current) setIsBuffering(false);
    }, [setIsBuffering]);

    // The speed the settings panel picks and the speed the cycle button picks
    // are now the same piece of state, so neither can be silently overridden
    // by a stale read of the other.
    const playbackRate = playbackRates[playbackRateIndex];

    useEffect(() => {
      onPlayBackRateChange?.(playbackRate);
    }, [playbackRate, onPlayBackRateChange]);

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
      // An open settings panel is an interaction in progress; hiding the
      // controls unmounts BottomControls and takes the panel with it, which is
      // what made speed and aspect ratio feel impossible to set.
      //
      // Nor while the source is still loading: the timer would run out during
      // the wait and leave a spinner alone on a black frame, with no title, no
      // scrubber and no way back except a tap. The countdown is meant to
      // measure how long the controls have sat over *a playing picture*, so it
      // starts when there is one — see the first-progress branch in onProgress.
      if (
        !isPaused &&
        !isAudio &&
        !settingsOpenRef.current &&
        !getIsBuffering()
      ) {
        controlsTimeout.current = setTimeout(hideControls, 3000);
      }
    }, [controlsOpacity, hideControls, isPaused, isAudio, getIsBuffering]);

    // Show controls on mount via showControls() (not a bare
    // setControlsVisible(true)) so the initial display also schedules the
    // 3s auto-hide for video — otherwise, until the user taps the screen
    // once, nothing ever starts that timer and controls stay visible
    // indefinitely. showControls itself skips scheduling that hide for audio,
    // and while the source is still loading; in that case onProgress arms it
    // once playback actually starts.
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

    // Cancel any pending hide the moment the panel opens, and start the timer
    // again once it closes — otherwise a timer armed just before the panel
    // opened would still fire mid-choice.
    const handleSettingsVisibilityChange = useCallback(
      open => {
        const wasOpen = settingsOpenRef.current;
        settingsOpenRef.current = open;
        if (open) {
          clearTimeout(controlsTimeout.current);
          return;
        }
        // Only on a real close. PlayerSettings also reports "not open" as it
        // unmounts, and it unmounts every time the controls hide — bringing
        // them straight back, hiding again three seconds later, forever.
        if (wasOpen) showControls();
      },
      [showControls],
    );

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

    // The panel offers the same list this component cycles through, so a pick
    // is just a jump to that entry.
    const selectPlaybackRate = useCallback(speed => {
      const index = playbackRates.indexOf(speed);
      if (index >= 0) setPlaybackRateIndex(index);
    }, []);

    // ─── Imperative API ───────────────────────────────────────────────────────
    // Must come *after* everything it closes over. It used to sit at the top of
    // the component, where `handleSeek`/`togglePlayPause` were still undefined:
    // babel lowers `const` to `var`, so instead of a TDZ error the dep array
    // silently evaluated to [undefined, undefined] on every render, never
    // changed, and the handle stayed frozen at the first render's closures.
    // togglePlayPause then captured isPaused === false forever, so calling it
    // through the ref always ran setIsPaused(true) — it could pause but never
    // resume. The in-app buttons were unaffected: they take togglePlayPause as
    // a prop, which is rebuilt every render.
    useImperativeHandle(
      ref,
      () => ({
        handleSeek,
        getCurrentTime: () => currentTimeRef.current,
        getIsPaused: () => isPaused,
        togglePlayPause,
        getDuration: () => durationRef.current,
      }),
      [handleSeek, togglePlayPause, isPaused],
    );

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
            // Time on the clock is the only unambiguous "it started" signal —
            // every event libVLC sends before this can still be followed by
            // more buffering. Guarded by the ref so this runs once per source
            // rather than on all four progress ticks a second.
            if (event.currentTime > 0 && !hasStartedRef.current) {
              hasStartedRef.current = true;
              setIsBuffering(false);
              // Playback exists now, so the controls have something to sit
              // over and the 3s countdown finally means something. showControls
              // skipped arming it every time it was called before this point.
              showControls();
            }
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
          onBuffering={handleBuffering}
          onPlaying={handlePlaying}
          playInBackground={true}
          videoAspectRatio={aspectRatio ?? undefined}
          rate={playbackRate}
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

        {!isInPip && !isAudio && <BufferingOverlay isPaused={isPaused} />}

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
          playbackRate={playbackRate}
          onSelectPlaybackRate={selectPlaybackRate}
          aspectRatio={aspectRatio}
          onSelectAspectRatio={setAspectRatio}
          onSettingsVisibilityChange={handleSettingsVisibilityChange}
        />}
      </SkipHandler>
    );
  },
);

// ─── BufferingOverlay ─────────────────────────────────────────────────────────
// Video only, and deliberately not tied to controlsOpacity: the controls fade
// out on their own timeout, and a network source can take longer than that to
// fill — which left a black frame with nothing on it and no way to tell a
// stalled stream from a broken one. Audio never auto-hides its controls (see
// showControls), so it has nothing to outlast and says it in the transport row
// instead.
//
// Subscribes to the store rather than taking the flag from the parent, so a
// stall re-renders these few lines and not <VLCPlayer>.
const BufferingOverlay = React.memo(({isPaused}) => {
  const isBuffering = usePlayerTimeStore(state => state.isBuffering);

  if (!isBuffering || isPaused) return null;

  return (
    <View style={styles.bufferingOverlay} pointerEvents="none">
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
});

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
    playbackRate,
    onSelectPlaybackRate,
    aspectRatio,
    onSelectAspectRatio,
    onSettingsVisibilityChange,
  }) => {
    const controlsVisible = usePlayerTimeStore(state => state.controlsVisible);
    const isBuffering = usePlayerTimeStore(state => state.isBuffering);

    if (!controlsVisible) return null;

    // Paused is waiting on the user, not on the network — nothing is loading,
    // so a spinner there would never resolve.
    const showBuffering = isBuffering && !isPaused;

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
            {/* While buffering the spinner replaces the button rather than
                sitting inside it: there is nothing to toggle yet, and a
                control that still looks pressable but does nothing reads as a
                stuck app. Same padding and margins as the button, and the same
                glyph slot, so the row doesn't shift either way. */}
            {showBuffering ? (
              <View style={styles.audioMainPlaceholder}>
                <View style={styles.audioMainGlyph}>
                  <ActivityIndicator size="large" color="white" />
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.audioMainButton}
                onPress={onTogglePlayPause}>
                <View style={styles.audioMainGlyph}>
                  <Icon
                    name={isPaused ? 'play-arrow' : 'pause'}
                    size={30}
                    color="white"
                  />
                </View>
              </TouchableOpacity>
            )}
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
              <PlayerSettings
                ref={settingsRef}
                playbackRate={playbackRate}
                onSelectPlaybackRate={onSelectPlaybackRate}
                aspectRatio={aspectRatio}
                onSelectAspectRatio={onSelectAspectRatio}
                onVisibilityChange={onSettingsVisibilityChange}
              />
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
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    // Above PlayPauseOverlay's zIndex 10, so a controls re-render arriving
    // mid-buffer cannot land on top of the spinner.
    zIndex: 11,
  },

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
  audioMainGlyph: {
    // 36, not the icon's 30: "large" is the only size ActivityIndicator takes
    // cross-platform and it draws at 36 on Android, so the slot is sized to
    // the bigger of the two occupants. Shared by both states — sizing it to
    // the glyph on show would shift the skip buttons every time buffering
    // started.
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // audioMainButton's box without its chrome — the pill background is the
  // part that says "press me", and there is nothing to press while buffering.
  audioMainPlaceholder: {
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

export default React.memo(VLCPlayerComponent);
