import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

const FilterBar = ({
  sourceType,
  fileType,
  toggleSourceType,
  toggleFileType,
  routeSourceType,
}) => {
  return (
    <View style={styles.filterContainer}>
      <View style={styles.filterRow}>
        {/* YouTube Button (Hidden if routeSourceType exists) */}
        {!routeSourceType && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              sourceType === 'youtube' && styles.activeFilter,
            ]}
            onPress={() => toggleSourceType('youtube')}>
            <Text style={[styles.filterText, { color: sourceType === 'youtube' ? 'white' : 'black' }]}>
              YouTube
            </Text>
          </TouchableOpacity>
        )}

        {/* File Button (Hidden if routeSourceType exists) */}
        {!routeSourceType && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              sourceType === 'drive' && styles.activeFilter,
            ]}
            onPress={() => toggleSourceType('drive')}>
            <Text style={[styles.filterText, { color: sourceType === 'drive' ? 'white' : 'black' }]}>
              File
            </Text>
          </TouchableOpacity>
        )}

        {/* Notebook Button (Hidden if routeSourceType exists) */}
        {!routeSourceType && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              sourceType === 'notebook' && styles.activeFilter,
            ]}
            onPress={() => toggleSourceType('notebook')}>
            <Text style={[styles.filterText, { color: sourceType === 'notebook' ? 'white' : 'black' }]}>
              Notebook
            </Text>
          </TouchableOpacity>
        )}

        {/* Audio Button (Disabled if sourceType is not 'drive', Hidden if routeSourceType is 'youtube') */}
        {routeSourceType === 'drive' && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              fileType === 'audio' && sourceType === 'drive' && styles.activeFilter,
              sourceType !== 'drive' && styles.disabledFilter,
            ]}
            onPress={() => toggleFileType('audio')}
            disabled={sourceType !== 'drive'}>
            <Text style={[styles.filterText, { color: sourceType !== 'drive' ? 'gray' : fileType === 'audio' ? 'white' : 'black' }]}>
              Audio
            </Text>
          </TouchableOpacity>
        )}

        {/* Video Button (Disabled if sourceType is not 'drive', Hidden if routeSourceType exists) */}
        {routeSourceType === 'drive' && (
          <TouchableOpacity
            style={[
              styles.filterButton,
              fileType === 'video' && sourceType === 'drive' && styles.activeFilter,
              sourceType !== 'drive' && styles.disabledFilter,
            ]}
            onPress={() => toggleFileType('video')}
            disabled={sourceType !== 'drive'}>
            <Text style={[styles.filterText, { color: sourceType !== 'drive' ? 'gray' : fileType === 'video' ? 'white' : 'black' }]}>
              Video
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  filterContainer: {
    marginTop: 5,
    backgroundColor: '#F8F8F8',
    borderRadius: 5,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterButton: {
    flex: 1,
    padding: 7,
    backgroundColor: '#E0E0E0',
    borderRadius: 95,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  activeFilter: {
    backgroundColor: '#000',
  },
  disabledFilter: {
    opacity: 0.6,
  },
  filterText: {
    fontSize: 12,
  },
});

export default FilterBar;
