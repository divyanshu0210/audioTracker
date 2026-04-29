import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import useRestoreStore from '../backupRestore/restoreStore';

const LoginRestoreProgressBar = () => {
  const { restorePercent, isRestoring, restoreError } = useRestoreStore();
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: restorePercent,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [restorePercent, animWidth]);

  const barWidth = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  if (!isRestoring) return null;

  return (
    <View style={styles.restoreContainer}>
      <Text style={styles.restoreTitle}>
        {restoreError ? "Restore paused..." : "Making things ready..."}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>
      <Text style={styles.percentLabel}>{restorePercent}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  restoreContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  restoreTitle: {
    fontSize: 16,
    color: '#e8f0f7',
    fontWeight: '600',
    marginBottom: 18,
    letterSpacing: 0.3,
  },
  barTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#1e3045',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#4fc3f7',
    borderRadius: 3,
  },
  percentLabel: {
    fontSize: 13,
    color: '#6b8299',
    fontVariant: ['tabular-nums'],
  },
});

export default LoginRestoreProgressBar;