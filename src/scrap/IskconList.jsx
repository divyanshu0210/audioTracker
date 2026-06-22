// IskconList.jsx
//
// Shared presentational list for the ISKCON audio browser: loading / error /
// empty states + a FlatList of IskconItem rows. All DB/download logic lives
// in iskconActions.js / IskconItem.jsx / IskconMenuItems.jsx — this file
// only renders.

import React, {useCallback} from 'react';
import {ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import IskconItem from './IskconItem';

const IskconList = ({loading, error, entries, onRetry, onFolderPress}) => {
  const renderItem = useCallback(
    ({item}) =>
      item.kind === 'section' ? (
        <Text style={styles.sectionLabel}>{item.label}</Text>
      ) : (
        <IskconItem entry={item} onFolderPress={onFolderPress} />
      ),
    [onFolderPress],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="cloud-off" size={48} color="#bbb" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={item =>
        item.kind === 'section' ? item.id : item.kind + ':' + (item.encodedPath || item.source_id)
      }
      renderItem={renderItem}
      contentContainerStyle={{paddingVertical: 8}}
      refreshing={false}
      onRefresh={onRetry}
      ListEmptyComponent={<Text style={styles.emptyText}>This folder is empty.</Text>}
    />
  );
};

export default IskconList;

const styles = StyleSheet.create({
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30},
  errorText: {marginTop: 12, fontSize: 14, color: '#888', textAlign: 'center'},
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  retryText: {color: '#fff', fontWeight: '600'},
  emptyText: {textAlign: 'center', marginTop: 40, color: '#888'},
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
});
