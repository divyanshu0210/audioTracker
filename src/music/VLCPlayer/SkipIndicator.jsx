// SkipIndicator.js
import React from 'react';
import {View, StyleSheet, Animated} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

const SkipIndicator = ({visible, direction, opacity}) => {
  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.skipIndicator,
        {
          left: direction === 'backward' ? '20%' : '70%',
          opacity: opacity,
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