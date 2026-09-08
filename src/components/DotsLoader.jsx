import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';

// Three dots bouncing in sequence, ported from the web FullPageLoader's
// @keyframes: scale 0 → 1.2 → 0 over 600ms, each dot 200ms behind the last.
//
// RN has no keyframes, so the timeline is rebuilt as a sequence — 240ms up,
// 240ms down, 120ms held flat — which is the 40% / 80% / 100% stops of the
// original. The phase offset comes from starting each loop late rather than
// from an animationDelay.
const DOT_COUNT = 3;
const STAGGER_MS = 200;
const UP_MS = 240;
const DOWN_MS = 240;
const REST_MS = 120;

const Dot = ({delay, color, size}) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: UP_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: DOWN_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(REST_MS),
      ]),
    );

    // Starting late is what staggers them. A timer rather than Animated.delay
    // inside the loop, so the offset applies once instead of on every cycle.
    const timer = setTimeout(() => loop.start(), delay);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          }),
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1.2],
              }),
            },
          ],
        },
      ]}
    />
  );
};

// `overlay` floats it over existing content instead of replacing it, so
// whatever can already be shown — a banner, a stale list — stays visible while
// the fetch runs. It still swallows touches: the content underneath is mid
// refresh, and letting it be tapped means acting on a list that is about to be
// replaced. The inline variant has nothing behind it, so it lets touches pass.
const DotsLoader = ({color = '#007bff', size = 12, overlay = false, style}) => (
  <View
    pointerEvents={overlay ? 'auto' : 'none'}
    style={[overlay ? styles.overlay : styles.container, style]}>
    <View style={styles.dots}>
      {Array.from({length: DOT_COUNT}, (_, i) => (
        <Dot key={i} delay={i * STAGGER_MS} color={color} size={size} />
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    // elevation as well as zIndex: on Android the two stacking systems are
    // separate, and a sibling with elevation would otherwise paint over this.
    zIndex: 9999,
    elevation: 9999,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Scale 0 collapses the dot to nothing, but the row still has to reserve its
  // slot or the remaining dots would slide sideways on every bounce.
  dot: {
    margin: 2,
  },
});

export default DotsLoader;
