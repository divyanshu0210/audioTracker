// SkipIndicator.jsx
// Fully self-contained: subscribes to its own slice of the store.
// No props needed — parent never re-renders because of skip state.
import React, { useRef, useEffect } from 'react';
import { StyleSheet, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import usePlayerTimeStore from './usePlayerTimeStore';

const SkipIndicator = () => {
  const visible   = usePlayerTimeStore(state => state.showSkipIndicator);
  const direction = usePlayerTimeStore(state => state.skipDirection);
  const opacity   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    // Animate in → hold → animate out
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 500, delay: 300, useNativeDriver: true }),
    ]).start(() => {
      usePlayerTimeStore.getState().setShowSkipIndicator(false);
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.skipIndicator,
        {
          left: direction === 'backward' ? '20%' : '70%',
          opacity,
        },
      ]}>
      <Icon
        name={direction === 'backward' ? 'replay-10' : 'forward-10'}
        size={30}
        color="white"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  skipIndicator: {
    position: 'absolute',
    top: '50%',
    marginTop: -25,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 50,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
});

export default SkipIndicator;