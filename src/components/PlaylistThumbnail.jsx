import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function PlaylistThumbnail({uri, size = 'default'}) {
  const compact = size === 'search';
  return (
    <View style={[styles.container, compact && styles.searchContainer]}>
      {/* Background layers that converge towards center */}
      {/* <View style={[styles.backLayer, styles.back3]} /> */}
      <View style={[styles.backLayer, styles.back2, compact && styles.searchBack2]} />
      <View style={[styles.backLayer, styles.back1, compact && styles.searchBack1]} />

      {/* Front image */}
      <Image
        source={uri}
        style={[styles.image, styles.front, compact && styles.searchFront]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 60,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    top:5,
    // marginLeft: 5,
  },
  backLayer: {
    position: 'absolute',
    backgroundColor: '#d0d0d0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#909090',
  },
  back3: {
    width: 90,
    height: 45,
    top: -8,
    zIndex: 1,
    opacity: 0.5,
  },
  back2: {
    width: 95,
    height: 52,
    top: -5.5,
    zIndex: 2,
    opacity: 0.7,
  },
  back1: {
    width: 98,
    height: 57,
    top: -3,
    zIndex: 3,
    opacity: 0.9,
  },
  front: {
    width: 100,
    height: 60,
    zIndex: 4,
    borderRadius: 8,
    // shadowColor: '#000',
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.1,
    // shadowRadius: 4,
    // elevation: 5,
  },
  searchContainer: {
    width: 140,
    height: 80,
    top: 0,
  },
  searchBack2: {
    width: 133,
    height: 72,
    top: -4,
    borderRadius: 7,
  },
  searchBack1: {
    width: 137,
    height: 76,
    top: -2,
    borderRadius: 7,
  },
  searchFront: {
    width: 140,
    height: 80,
    borderRadius: 7,
  },
  image: {
    position: 'absolute',
  },
});
