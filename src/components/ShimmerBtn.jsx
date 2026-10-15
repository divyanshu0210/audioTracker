import React, {useEffect, useRef} from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

const DEFAULT_COLORS = {
  base: '#f3f4f6',
  loading: '#d1d5db',
  active: '#dcfce7',
};

/**
 * A compact icon button with an optional pulsing background while an action is
 * starting. The icon remains the caller's responsibility, so each button can
 * keep its own visual language while sharing the loading behavior.
 */
const ShimmerBtn = ({
  icon,
  onPress,
  loading = false,
  active = false,
  colors = DEFAULT_COLORS,
  style,
  hitStyle,
  disabled = false,
  ...touchableProps
}) => {
  const pulse = useRef(new Animated.Value(0.25)).current;
  const palette = {...DEFAULT_COLORS, ...colors};

  useEffect(() => {
    if (!loading) {
      pulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 800,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 800,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [loading, pulse]);

  return (
    <TouchableOpacity
      {...touchableProps}
      onPress={onPress}
      disabled={disabled || loading}
      style={hitStyle}
      accessibilityState={{...(touchableProps.accessibilityState || {}), disabled: disabled || loading}}>
      <View style={[styles.button, style, {backgroundColor: active ? palette.active : palette.base}]}>
        {loading && (
          <Animated.View
            pointerEvents="none"
            style={[styles.overlay, {backgroundColor: palette.loading, opacity: pulse}]}
          />
        )}
        {icon}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    // Clip the animated layer to the button's own border radius. Without
    // this, the loading colour can spill out as a rectangle around circular
    // icon buttons.
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default ShimmerBtn;
