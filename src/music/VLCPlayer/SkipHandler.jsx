// SkipHandler.jsx
// Owns ALL skip logic (double-tap detection, skipTime, animating the indicator).
// Accepts a ref to the vlcPlayer and exposes nothing upward —
// the parent no longer holds any skip-related state or handlers.
import React, { useRef, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import usePlayerTimeStore from './usePlayerTimeStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DOUBLE_PRESS_DELAY = 300;

/**
 * Props
 *  vlcPlayerRef  – ref to the VLCPlayer instance (for seek calls)
 *  onSingleTap   – called on single tap (show controls, close settings)
 *  onCenterDoubleTap – called when double-tap lands in center third (toggle play/pause)
 *  children      – everything rendered inside the touchable area
 */
const SkipHandler = ({ vlcPlayerRef, onSingleTap, onCenterDoubleTap, children }) => {
  const lastTap = useRef(0);

  // Use getState() inside callbacks so we never need these as reactive deps
  const triggerSkip = useCallback((seconds) => {
    const { getCurrentTime, getDuration, setCurrentTime } = usePlayerTimeStore.getState();
    const currentTime = getCurrentTime();
    const duration    = getDuration();

    if (!vlcPlayerRef.current || !duration) return;

    const newTime = Math.max(0, Math.min(currentTime + seconds * 1000, duration));
    vlcPlayerRef.current.seek(newTime / duration);
    setCurrentTime(newTime);
  }, [vlcPlayerRef]);

  const triggerSkipAnimation = useCallback((direction) => {
    const { setSkipDirection, setShowSkipIndicator } = usePlayerTimeStore.getState();
    setSkipDirection(direction);
    setShowSkipIndicator(true); // SkipIndicator watches this and runs its own animation
  }, []);

  const handlePressOut = useCallback((event) => {
    const now = Date.now();
    const { locationX } = event.nativeEvent;

    if (lastTap.current && now - lastTap.current < DOUBLE_PRESS_DELAY) {
      const screenThird = SCREEN_WIDTH / 3;

      if (locationX < screenThird) {
        triggerSkip(-10);
        triggerSkipAnimation('backward');
      } else if (locationX > screenThird * 2) {
        triggerSkip(10);
        triggerSkipAnimation('forward');
      } else {
        onCenterDoubleTap?.();
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [triggerSkip, triggerSkipAnimation, onCenterDoubleTap]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.touchable}
      onPress={onSingleTap}
      onPressOut={handlePressOut}
    >
      {children}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default SkipHandler;