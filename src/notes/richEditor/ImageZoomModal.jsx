// ImageZoomModal.jsx
//
// Full-screen pinch-to-zoom/pan viewer, opened by tapping an image inside a
// note (see RichTextEditor's IMAGE_TAP_JS injection + handleMessage). Shows
// whatever the tapped <img> element's current `src` is — usually a local
// file:// URI, since note images are cached locally.

import React, {useEffect} from 'react';
import {Modal, StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

const ImageZoomModal = ({visible, uri, onClose}) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Start every image fresh (unzoomed, centered) rather than carrying over
  // the previous image's zoom/pan state — Modal keeps children mounted
  // across visible toggles, it doesn't remount them.
  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [visible, uri]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(
        MIN_SCALE,
        Math.min(savedScale.value * e.scale, MAX_SCALE),
      );
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      if (savedScale.value <= MIN_SCALE) return; // nothing to pan when not zoomed
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: translateX.value},
      {translateY: translateY.value},
      {scale: scale.value},
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {uri && (
            <GestureDetector gesture={composedGesture}>
              <Animated.Image
                source={{uri}}
                style={[styles.image, animatedStyle]}
                resizeMode="contain"
              />
            </GestureDetector>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default ImageZoomModal;

const styles = StyleSheet.create({
  container: {flex: 1},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
