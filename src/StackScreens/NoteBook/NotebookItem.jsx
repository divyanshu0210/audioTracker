// components/NotebookItem.js
import {useNavigation} from '@react-navigation/core';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import { ItemTypes } from '../../contexts/constants';
import {useNotesStore} from '../../stores/useNotesStore';

const NotebookItem = ({item}) => {
  // Read from the counts map rather than the row, so refreshing the notebook
  // list doesn't blank the badge. undefined until the first count lands — a
  // "0" then would state something false rather than "not counted yet".
  const noteCount = useNotesStore(state =>
    state.notebookCountsLoaded
      ? state.notebookNoteCounts[String(item.id)] || 0
      : undefined,
  );
  const counted = noteCount !== undefined;
  const isEmpty = !noteCount;
  const countLabel = isEmpty
    ? 'No notes'
    : `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;
  return (
    <View style={styles.notebookItem}>
      {/* <View style={[styles.colorBar, {backgroundColor: item.color}]} /> */}
      <MaterialCommunityIcons
        name="notebook"
        size={32}
        color={item.color}
        style={{marginRight: 8}}
      />
      <View style={styles.notebookInfo}>
        {/* Title shrinks and ellipsises first; the count keeps its width so a
            long notebook name can't push it off the row. */}
        <Text style={styles.notebookTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {counted && (
          <Text style={[styles.count, isEmpty && styles.countEmpty]}>
            {` · ${countLabel}`}
          </Text>
        )}
      </View>
      {/* <BaseMenu item={item} type={ItemTypes.NOTEBOOK}/> */}
    </View>
  );
};

export default NotebookItem;

const styles = StyleSheet.create({
  notebookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex:1,
  },
  colorBar: {
    width: 6,
    alignSelf:'stretch',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  notebookInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  notebookTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
    flexShrink: 1,
  },
  count: {
    fontSize: 13,
    color: '#8a8a8f',
  },
  countEmpty: {
    color: '#b8b8be',
  },
});
