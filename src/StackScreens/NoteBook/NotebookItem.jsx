// components/NotebookItem.js
import {useNavigation} from '@react-navigation/core';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import { ItemTypes } from '../../contexts/constants';

const NotebookItem = ({item}) => {
  return (
    <View style={styles.notebookItem}>
      <View style={[styles.colorBar, {backgroundColor: item.color}]} />
      <MaterialCommunityIcons
        name="notebook"
        size={32}
        color={item.color}
        style={{marginRight: 8}}
      />
      <View style={styles.notebookInfo}>
        <Text style={styles.notebookTitle}>{item.title}</Text>
        {/* <Text style={styles.notebookDate}>
          Created at: {new Date(item.created_at).toLocaleString()}
        </Text> */}
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
    height: '100%',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  notebookInfo: {
    flex: 1,
    paddingLeft: 10,
  },
  notebookTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  notebookDate: {
    fontSize: 12,
    color: '#555',
  },
});
