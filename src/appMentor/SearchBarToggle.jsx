import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
} from 'react-native';

const { width } = Dimensions.get('window');

const SearchBarToggle = forwardRef(
  (
    {
      value,
      onChangeText,
      placeholder = 'Search...',
      inputStyle,
      containerStyle,
      icon,
      autoFocus = false,
      onToggle = () => {},
      ...restProps
    },
    ref
  ) => {
    const [active, setActive] = useState(false);
    const animatedWidth = useState(new Animated.Value(0))[0];

    // Expose open/close methods to parent
    useImperativeHandle(ref, () => ({
      open: () => {
        setActive(true);
        Animated.timing(animatedWidth, {
          toValue: width * 0.8,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => onToggle(true));
      },
      close: () => {
        Animated.timing(animatedWidth, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => {
          setActive(false);
          onToggle(false);
        });
      },
      isActive: () => active,
    }));

    return (
      <View style={[styles.wrapper, containerStyle]}>
        <TouchableOpacity
          onPress={() => (active ? ref.current?.close() : ref.current?.open())}
          style={styles.iconWrapper}>
          {icon}
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.searchBar,
            {
              width: animatedWidth,
              marginLeft: 8,
              opacity: animatedWidth.interpolate({
                inputRange: [0, width * 0.7],
                outputRange: [0, 1],
              }),
            },
          ]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            style={[styles.input, inputStyle]}
            autoCapitalize="none"
            autoFocus={active && autoFocus}
            {...restProps}
          />
        </Animated.View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    paddingVertical: 8,
  },
  searchBar: {
    height: 40,
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  input: {
    fontSize: 16,
    flex: 1,
    color: '#333',
  },
});

export default SearchBarToggle;
