// PlayPauseOverlay.jsx
// Subscribes only to isPaused + controlsVisible.
// Re-renders independently — VLCPlayerComponent is NOT involved.
import React from 'react';
import { StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import usePlayerTimeStore from './usePlayerTimeStore';

/**
 * Props
 *  controlsOpacity – Animated.Value shared from parent (driven by controlsVisible changes)
 *  onTogglePlayPause – callback to toggle isPaused in the store & on the player
 *  isAudio – hide overlay for audio mode
 */
const PlayPauseOverlay = ({ controlsOpacity, onTogglePlayPause, isAudio , isPaused}) => {
  const controlsVisible = usePlayerTimeStore(state => state.controlsVisible);

  if (isAudio || !controlsVisible) return null;

  return (
    <Animated.View style={[styles.overlayControls, { opacity: controlsOpacity }]}>
      <TouchableOpacity style={styles.playPauseButton} onPress={onTogglePlayPause}>
        <Icon name={isPaused ? 'play-arrow' : 'pause'} size={50} color="white" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayControls: {
    ...require('react-native').StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playPauseButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 50,
    padding: 3,
  },
});

export default React.memo(PlayPauseOverlay);