// components/InsertingProgressBar.jsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import useDbStore from '../database/dbStore';

export const LoadingBar = ({ speed = 1400, active }) => {
  const translateX = useRef(new Animated.Value(-100)).current;
  const storeInserting = useDbStore(state => state.inserting);
  // When `active` is passed, it drives the bar (e.g. note loading); otherwise
  // fall back to the global DB-insert flag (e.g. HomeTabs).
  const isInserting = active !== undefined ? active : storeInserting;

  useEffect(() => {
    if (isInserting) {
      // Create the animation once when isInserting becomes true
      const animation = Animated.loop(
        Animated.timing(translateX, {
          toValue: 400,           // how far the bar travels (adjust if your screen is very wide/narrow)
          duration: speed,        // ← controlled by prop (default 1400ms)
          useNativeDriver: true,
        })
      );

      animation.start();

      // Cleanup: stop when component unmounts or isInserting changes to false
      return () => {
        animation.stop();
        translateX.setValue(-100);
      };
    } else {
      // Reset position when not inserting
      translateX.stopAnimation();
      translateX.setValue(-100);
    }
  }, [isInserting, speed]);   // ← important: re-run when speed changes

  if (!isInserting) return null;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.bar, { transform: [{ translateX }] }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 3,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 4,
    borderRadius: 2,
  },
  bar: {
    height: '100%',
    width: 120,
    backgroundColor: '#007aff',
    borderRadius: 2,
    opacity: 0.9,
  },
});