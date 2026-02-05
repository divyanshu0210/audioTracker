import React from 'react';
import {
  ScrollView,
  Dimensions,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

export default function ZoomableNoteWrapper({ children }) {
  const scale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(e.scale, 3)); // clamp scale between 1 and 3
    });

  const animatedStyle = useAnimatedStyle(() => ({
    width: screenWidth * scale.value,
    height: screenHeight * scale.value,
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={pinchGesture}>
        <ScrollView
          horizontal
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={true}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator
          >
            <Animated.View style={[animatedStyle, styles.zoomableContent]}>
              {children}
            </Animated.View>
          </ScrollView>
        </ScrollView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  zoomableContent: {
    backgroundColor: '#fff',
    // padding: 20,
  },
});
