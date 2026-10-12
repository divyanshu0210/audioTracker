// components/TimeControls.js
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import usePlayerTimeStore from './usePlayerTimeStore';

export const formatTime = time => {
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

const SliderWithTime = ({ style, onSeek, sliderStyle, stacked = false, topRight }) => {
  // Subscribe to both time and duration in one component
  const currentTime = usePlayerTimeStore((state) => state.currentTime);
  const duration = usePlayerTimeStore((state) => state.duration);
  
  const handleSlidingComplete = useCallback((value) => {
    onSeek?.(value);
  }, [onSeek]);
  
  // Memoize formatted times to avoid recalculation on every render
  const formattedCurrentTime = React.useMemo(() => 
    formatTime(currentTime / 1000), 
    [currentTime]
  );
  
  const formattedDuration = React.useMemo(() => 
    formatTime(duration / 1000), 
    [duration]
  );
  
  if (stacked) {
    return (
      <View style={[styles.stackedContainer, style]}>
        <View style={styles.stackedTopRow}>
          <Text style={[styles.timeText, styles.stackedTimeText]}>
            {formattedCurrentTime} / {formattedDuration}
          </Text>
          {topRight}
        </View>
        <Slider
          style={[styles.slider, styles.stackedSlider, sliderStyle]}
          value={currentTime}
          minimumValue={0}
          maximumValue={duration}
          onSlidingComplete={handleSlidingComplete}
          minimumTrackTintColor="red"
          maximumTrackTintColor="rgba(255, 255, 255, 0.5)"
          thumbTintColor="red"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.timeText}>
        {formattedCurrentTime}
      </Text>
      
      <Slider
        style={[styles.slider, sliderStyle]}
        value={currentTime}
        minimumValue={0}
        maximumValue={duration}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor="red"
        maximumTrackTintColor="rgba(255, 255, 255, 0.5)"
        thumbTintColor="red"
      />
      
      <Text style={styles.timeText}>
        {formattedDuration}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stackedContainer: {
    width: '100%',
    alignItems: 'center',
  },
  stackedTopRow: {
    width: '95%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stackedTimeText: {
    width: 'auto',
    flexShrink: 0,
    paddingLeft: 4,
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
  },
  stackedSlider: {
    width: '99%',
    marginHorizontal: 0,
    marginTop: -6,
  },
  timeText: {
    color: 'white',
    fontSize: 12,
    width: 50,
    textAlign: 'center',
  },
});

export default React.memo(SliderWithTime);
