import React, {useEffect, useRef} from 'react';
import {Animated} from 'react-native';

// A lightweight pulse is enough for small loading pills and cards. Keeping it
// here avoids a native gradient dependency and gives every loading state the
// same animation.
const AppShimmerPlaceholder = ({style, autoRun = true, duration = 900}) => {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!autoRun) return undefined;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [autoRun, duration, opacity]);

  return (
    <Animated.View
      style={[{backgroundColor: '#cfcfcf'}, style, {opacity}]}
    />
  );
};

export default AppShimmerPlaceholder;
