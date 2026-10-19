import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {navigationRef} from '../../handlers/navigationRef';

export default function YouTubeSearchBar() {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Search YouTube"
      onPress={() => navigationRef.navigate('YouTubeSearch')}
      style={styles.searchBar}>
      <MaterialIcons name="search" size={21} color="#606060" />
      <Text style={styles.searchPlaceholder}>Search YouTube</Text>
      <MaterialIcons name="keyboard-voice" size={21} color="#606060" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    minHeight: 46,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: '#f2f2f2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchPlaceholder: {
    color: '#606060',
    fontSize: 15,
    flex: 1,
  },
});
