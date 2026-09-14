// ImageZoomModal.jsx
//
// Full-screen pinch-to-zoom/pan viewer, opened by tapping an image inside a
// note (see RichTextEditor's IMAGE_TAP_JS injection + handleMessage). Shows
// whatever the tapped <img> element's current `src` is — usually a local
// file:// URI, since note images are cached locally.

import React, {useCallback, useEffect} from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Share from 'react-native-share';
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

const ImageZoomModal = ({visible, uri, onClose, onCrop}) => {
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

  // The picture on screen is the cache file, which is a real path on disk, so
  // it can go straight to the share sheet — same shape as every other share in
  // the app, cancel included (Share.open rejects on a plain dismissal).
  const handleShare = useCallback(async () => {
    if (!uri) return;
    try {
      await Share.open({
        url: uri,
        type: uri.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg',
        filename: 'note-image',
        failOnCancel: false,
      });
    } catch (error) {
      console.log('Share image cancelled or failed:', error);
    }
  }, [uri]);

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

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
              hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
              <MaterialIcons name="share" size={22} color="#fff" />
              <Text style={styles.actionLabel}>Share</Text>
            </TouchableOpacity>

            {/* Only for images the note owns — re-cropping needs the id that
                ties the picture to its row. */}
            {!!onCrop && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onCrop}
                hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                <MaterialIcons name="crop" size={22} color="#fff" />
                <Text style={styles.actionLabel}>Crop</Text>
              </TouchableOpacity>
            )}
          </View>

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
  actions: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    zIndex: 10,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
  },
  actionLabel: {color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 8},
  image: {
    width: '100%',
    height: '100%',
  },
});
